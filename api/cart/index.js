(function (){
  'use strict';

  var async     = require("async")
    , express   = require("express")
    , originalRequest   = require("request")
    , helpers   = require("../../helpers")
    , endpoints = require("../endpoints")
    , app       = express()

 
  var serviceName = "front-end-remotecall";
  var remoteServiceName = "cart";
  
  var _require = require('zipkin'),
    _require$option = _require.option,
    Some = _require$option.Some,
    None = _require$option.None,
    Instrumentation = _require.Instrumentation;
  
  const wrapRequest = require('zipkin-instrumentation-request');


  const {Tracer, BatchRecorder, CountingSampler, jsonEncoder: {JSON_V2}} = require('zipkin');
  var zipkin = require("zipkin");
  const CLSContext = require('zipkin-context-cls');
  const ctxImpl = new CLSContext('cart');
  const {HttpLogger} = require('zipkin-transport-http');
  const zipkinUrl = process.env.ZIPKIN_URL;

  const recorder = new BatchRecorder({
    logger: new HttpLogger({
      endpoint: `${zipkinUrl}`,
      jsonEncoder: JSON_V2
    })
  });

  const tracer = new Tracer({
    ctxImpl,
    recorder: recorder,
    localServiceName: serviceName,
    sampler: new zipkin.sampler.CountingSampler(1), // sample rate 0.01 will sample 1 % of all incoming requests
    traceId128Bit: false // to generate 128-bit trace IDs.
  });



  var url = require('url');

  function formatRequestUrl(req) {
    var parsed = url.parse(req.originalUrl);
    return url.format({
      protocol: req.protocol,
      host: req.get('host'),
      pathname: parsed.pathname,
      search: parsed.search
    });
  }
  var instrumentation = new Instrumentation.HttpServer({ tracer: tracer, serviceName: "front-end", port: 0 });
  // List items in cart for current logged in user.
  app.get("/cart", function (req, res, next) {
    tracer.scoped(function () {
      function readHeader(header) {
        var val = req.header(header);
        if (val != null) {
          return new Some(val);
        } else {
          return None;
        }
      }  
    var id = instrumentation.recordRequest(req.method, formatRequestUrl(req), readHeader);

    console.log("Request received: " + req.url + ", " + req.query.custId);
    var custId = helpers.getCustomerId(req, app.get("env"));
    console.log("Customer ID: " + custId);
    var request = wrapRequest(originalRequest, {tracer, serviceName, remoteServiceName});
    
    request(endpoints.cartsUrl + "/" + custId + "/items", function (error, response, body) {
      if (error) {
        return next(error);
      }
      helpers.respondStatusBody(res, response.statusCode, body)
      instrumentation.recordResponse(id, res.statusCode);
    });
  });
  });

  // Delete cart
  app.delete("/cart", function (req, res, next) {
    tracer.scoped(function () {
      function readHeader(header) {
        var val = req.header(header);
        if (val != null) {
          return new Some(val);
        } else {
          return None;
        }
      }
      var id = instrumentation.recordRequest(req.method, formatRequestUrl(req), readHeader);

    var custId = helpers.getCustomerId(req, app.get("env"));
    console.log('Attempting to delete cart for user: ' + custId);
    var options = {
      uri: endpoints.cartsUrl + "/" + custId,
      method: 'DELETE'
    };

    var request = wrapRequest(originalRequest, {tracer, serviceName, remoteServiceName});
    request(options, function (error, response, body) {
      if (error) {
        return next(error);
      }
      console.log('User cart deleted with status: ' + response.statusCode);
      helpers.respondStatus(res, response.statusCode);
      instrumentation.recordResponse(id, res.statusCode);
  });
  });
  });

  // Delete item from cart
  app.delete("/cart/:id", function (req, res, next) {
    tracer.scoped(function () {
      function readHeader(header) {
        var val = req.header(header);
        if (val != null) {
          return new Some(val);
        } else {
          return None;
        }
      }
      var id = instrumentation.recordRequest(req.method, formatRequestUrl(req), readHeader);

    if (req.params.id == null) {
      return next(new Error("Must pass id of item to delete"), 400);
    }

    console.log("Delete item from cart: " + req.url);

    var custId = helpers.getCustomerId(req, app.get("env"));

    var options = {
      uri: endpoints.cartsUrl + "/" + custId + "/items/" + req.params.id.toString(),
      method: 'DELETE'
    };

    var request = wrapRequest(originalRequest, {tracer, serviceName, remoteServiceName});
    request(options, function (error, response, body) {
      if (error) {
        return next(error);
      }
      console.log('Item deleted with status: ' + response.statusCode);
      helpers.respondStatus(res, response.statusCode);
      instrumentation.recordResponse(id, res.statusCode);
    });
});
  });

  // Add new item to cart
  app.post("/cart", function (req, res, next) {
    tracer.scoped(function () {
      function readHeader(header) {
        var val = req.header(header);
        if (val != null) {
          return new Some(val);
        } else {
          return None;
        }
      }
    var id = instrumentation.recordRequest(req.method, formatRequestUrl(req), readHeader);
    tracer.recordBinary('body', JSON.stringify(req.body));
    console.log("Attempting to add to cart: " + JSON.stringify(req.body));
    
    if (req.body.id == null) {
      next(new Error("Must pass id of item to add"), 400);
      return;
    }

    var custId = helpers.getCustomerId(req, app.get("env"));
    var tempId = tracer.id;
    async.waterfall([
        function (callback) {
          tracer.setId(tempId);
          var request = wrapRequest(originalRequest, {tracer, serviceName, remoteServiceName});

          request(endpoints.catalogueUrl + "/catalogue/" + req.body.id.toString(), function (error, response, body) {
            console.log(body);
            callback(error, JSON.parse(body));
          });
        },
        function (item, callback) {
          var options = {
            uri: endpoints.cartsUrl + "/" + custId + "/items",
            method: 'POST',
            json: true,
            body: {itemId: item.id, unitPrice: item.price}
          };
          console.log("POST to carts: " + options.uri + " body: " + JSON.stringify(options.body));
          req.session.lastBody = options.body;
          tracer.setId(tempId);
          var request = wrapRequest(originalRequest, {tracer, serviceName, remoteServiceName});
          request(options, function (error, response, body) {
            if (error) {
              callback(error)
                return;
            }
            callback(null, response.statusCode);
          });
        }
    ], function (err, statusCode) {
      if (err) {
        return next(err);
      }
      if (statusCode != 201) {
        return next(new Error("Unable to add to cart. Status code: " + statusCode))
      }
      helpers.respondStatus(res, statusCode);
      instrumentation.recordResponse(id, res.statusCode);
    });
  });
  });

// Update cart item
  app.post("/cart/update", function (req, res, next) {
    tracer.scoped(function () {
      function readHeader(header) {
        var val = req.header(header);
        if (val != null) {
          return new Some(val);
        } else {
          return None;
        }
      }
      var id = instrumentation.recordRequest(req.method, formatRequestUrl(req), readHeader);
      tracer.recordBinary('body', JSON.stringify(req.body));

    console.log("Attempting to update cart item: " + JSON.stringify(req.body));

    if (req.body.id == null) {
      next(new Error("Must pass id of item to update"), 400);
      return;
    }
    if (req.body.quantity == null) {
      next(new Error("Must pass quantity to update"), 400);
      return;
    }
    var custId = helpers.getCustomerId(req, app.get("env"));
    var tempId = tracer.id;
    async.waterfall([
        function (callback) {
          tracer.setId(tempId);
          var request = wrapRequest(originalRequest, {tracer, serviceName, remoteServiceName});
          request(endpoints.catalogueUrl + "/catalogue/" + req.body.id.toString(), function (error, response, body) {
            console.log(body);
            callback(error, JSON.parse(body));
          });
        },
        function (item, callback) {
          var options = {
            uri: endpoints.cartsUrl + "/" + custId + "/items",
            method: 'PATCH',
            json: true,
            body: {itemId: item.id, quantity: parseInt(req.body.quantity), unitPrice: item.price}
          };
          console.log("PATCH to carts: " + options.uri + " body: " + JSON.stringify(options.body));
          req.session.lastBody = options.body;
          tracer.setId(tempId);
          var request = wrapRequest(originalRequest, {tracer, serviceName, remoteServiceName});

          request(options, function (error, response, body) {
            if (error) {
              callback(error)
                return;
            }
            callback(null, response.statusCode);
          });
        }
    ], function (err, statusCode) {
      if (err) {
        return next(err);
      }
      if (statusCode != 202) {
        return next(new Error("Unable to add to cart. Status code: " + statusCode))
      }
      helpers.respondStatus(res, statusCode);
      instrumentation.recordResponse(id, res.statusCode);
    });
  });
});
  module.exports = app;
}());
