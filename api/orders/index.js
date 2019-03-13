(function (){
  'use strict';

  var async     = require("async")
    , express   = require("express")
    , originalRequest  = require("request")
    , endpoints = require("../endpoints")
    , helpers   = require("../../helpers")
    , app       = express()

    var serviceName = "front-end-remotecall";
    var remoteServiceName = "orders";
    
    
    const wrapRequest = require('zipkin-instrumentation-request');
    
    const zipkinMiddleware = require('zipkin-instrumentation-express').expressMiddleware;
    const {Tracer, BatchRecorder, CountingSampler, jsonEncoder: {JSON_V2}} = require('zipkin');
    const zipkin = require("zipkin");
    
    var _require = require('zipkin'),
    _require$option = _require.option,
    Some = _require$option.Some,
    None = _require$option.None,
    Instrumentation = _require.Instrumentation;

    const CLSContext = require('zipkin-context-cls');
    const ctxImpl = new CLSContext('orders');
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

  app.get("/orders", function (req, res, next) {
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
    console.log("Request received with body: " + JSON.stringify(req.body));
    var logged_in = req.cookies.logged_in;
    if (!logged_in) {
      throw new Error("User not logged in.");
      return
    }

    var custId = req.session.customerId;
    var tempId = tracer.id;
    async.waterfall([
        function (callback) {
          tracer.setId(tempId);
          var request = wrapRequest(originalRequest, {tracer, serviceName, remoteServiceName});
          request(endpoints.ordersUrl + "/orders/search/customerId?sort=date&custId=" + custId, function (error, response, body) {
            if (error) {
              return callback(error);
            }
            console.log("Received response: " + JSON.stringify(body));
            if (response.statusCode == 404) {
              console.log("No orders found for user: " + custId);
              return callback(null, []);
            }
            callback(null, JSON.parse(body)._embedded.customerOrders);
          });
        }
    ],
    function (err, result) {
      if (err) {
        return next(err);
      }
      helpers.respondStatusBody(res, 201, JSON.stringify(result));
      instrumentation.recordResponse(id, res.statusCode);
    });
  });
});

  app.get("/orders/*", function (req, res, next) {
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
    var url = endpoints.ordersUrl + req.url.toString();
    
    var request = wrapRequest(originalRequest, {tracer, serviceName, remoteServiceName});

    request.get(url).pipe(res);
    instrumentation.recordResponse(id, res.statusCode);
    });
});

  app.post("/orders", function(req, res, next) {
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
    console.log("Request received with body: " + JSON.stringify(req.body));
    var logged_in = req.cookies.logged_in;
    if (!logged_in) {
      throw new Error("User not logged in.");
      return
    }

    var custId = req.session.customerId;
    var tempId = tracer.id;
    async.waterfall([
        function (callback) {
          tracer.setId(tempId);
          var request = wrapRequest(originalRequest, {tracer, serviceName, remoteServiceName});
          request(endpoints.customersUrl + "/" + custId, function (error, response, body) {
            if (error || body.status_code === 500) {
              callback(error);
              return;
            }
            console.log("Received response: " + JSON.stringify(body));
            var jsonBody = JSON.parse(body);
            var customerlink = jsonBody._links.customer.href;
            var addressLink = jsonBody._links.addresses.href;
            var cardLink = jsonBody._links.cards.href;
            var order = {
              "customer": customerlink,
              "address": null,
              "card": null,
              "items": endpoints.cartsUrl + "/" + custId + "/items"
            };
            callback(null, order, addressLink, cardLink);
          });
        },
        function (order, addressLink, cardLink, callback) {
          async.parallel([
              function (callback) {
                console.log("GET Request to: " + addressLink);
                tracer.setId(tempId);
                var request = wrapRequest(originalRequest, {tracer, serviceName, remoteServiceName});
                request.get(addressLink, function (error, response, body) {
                  if (error) {
                    callback(error);
                    return;
                  }
                  console.log("Received response: " + JSON.stringify(body));
                  var jsonBody = JSON.parse(body);
                  if (jsonBody.status_code !== 500 && jsonBody._embedded.address[0] != null) {
                    order.address = jsonBody._embedded.address[0]._links.self.href;
                  }
                  callback();
                });
              },
              function (callback) {
                console.log("GET Request to: " + cardLink);
                tracer.setId(tempId);
                var request = wrapRequest(originalRequest, {tracer, serviceName, remoteServiceName});
                request.get(cardLink, function (error, response, body) {
                  if (error) {
                    callback(error);
                    return;
                  }
                  console.log("Received response: " + JSON.stringify(body));
                  var jsonBody = JSON.parse(body);
                  if (jsonBody.status_code !== 500 && jsonBody._embedded.card[0] != null) {
                    order.card = jsonBody._embedded.card[0]._links.self.href;
                  }
                  callback();
                });
              }
          ], function (err, result) {
            if (err) {
              callback(err);
              return;
            }
            console.log(result);
            callback(null, order);
          });
        },
        function (order, callback) {
          var options = {
            uri: endpoints.ordersUrl + '/orders',
            method: 'POST',
            json: true,
            body: order
          };
          console.log("Posting Order: " + JSON.stringify(order));
          req.session.lastBody = order;
          tracer.setId(tempId);
          var request = wrapRequest(originalRequest, {tracer, serviceName, remoteServiceName});
          
          request(options, function (error, response, body) {
            if (error) {
              return callback(error);
            }
            console.log("Order response: " + JSON.stringify(response));
            console.log("Order response: " + JSON.stringify(body));
            callback(null, response.statusCode, body);
          });
        }
    ],
    function (err, status, result) {
      if (err) {
        return next(err);
      }
      helpers.respondStatusBody(res, status, JSON.stringify(result));
      instrumentation.recordResponse(id, res.statusCode);
    });
  });
});

  module.exports = app;
}());
