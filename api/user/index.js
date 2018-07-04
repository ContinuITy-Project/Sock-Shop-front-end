(function() {
    'use strict';

    var async = require("async"), express = require("express"), originalRequest = require("request"), endpoints = require("../endpoints"), helpers = require("../../helpers"), app = express(), cookie_name = "logged_in"
    
    var serviceName = "frontend-remotecall";
    var remoteServiceName = "user";
    
    
    const wrapRequest = require('zipkin-instrumentation-request');
    
    const zipkinMiddleware = require('zipkin-instrumentation-express').expressMiddleware;
    const {Tracer, BatchRecorder, CountingSampler, jsonEncoder: {JSON_V2}} = require('zipkin');
    const zipkin = require("zipkin");
  
    const CLSContext = require('zipkin-context-cls');
    const ctxImpl = new CLSContext('user');
    const {HttpLogger} = require('zipkin-transport-http');

    var port = process.env.ZIPKIN_PORT;
    var host = process.env.ZIPKIN_HOST;
    const zipkinUrl = `http://${host}:${port}`;

    const recorder = new BatchRecorder({
        logger: new HttpLogger({
        endpoint: `${zipkinUrl}/rest/api/v2/spans`,
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
  app.use(zipkinMiddleware({tracer}));


    app.get("/customers/:id", function(req, res, next) {
        helpers.simpleHttpRequest(endpoints.customersUrl + "/" + req.session.customerId, res, next, tracer);
    });
    app.get("/cards/:id", function(req, res, next) {
        helpers.simpleHttpRequest(endpoints.cardsUrl + "/" + req.params.id, res, next, tracer);
    });

    app.get("/customers", function(req, res, next) {
        helpers.simpleHttpRequest(endpoints.customersUrl, res, next, tracer);
    });
    app.get("/addresses", function(req, res, next) {
        helpers.simpleHttpRequest(endpoints.addressUrl, res, next, tracer);
    });
    app.get("/cards", function(req, res, next) {
        helpers.simpleHttpRequest(endpoints.cardsUrl, res, next, tracer);
    });

    // Create Customer - TO BE USED FOR TESTING ONLY (for now)
    app.post("/customers", function(req, res, next) {
        var options = {
            uri: endpoints.customersUrl,
            method: 'POST',
            json: true,
            body: req.body
        };

        console.log("Posting Customer: " + JSON.stringify(req.body));
        req.session.lastBody = req.body;

        var tracer = global.tracer;
        var request = wrapRequest(originalRequest, {tracer, serviceName, remoteServiceName});
        tracer.local('pay-me', () => {

        request(options, function(error, response, body) {
            if (error) {
                return next(error);
            }
            helpers.respondSuccessBody(res, JSON.stringify(body));
        }.bind({
            res: res
        }));
    });
    });

    app.post("/addresses", function(req, res, next) {
        req.body.userID = helpers.getCustomerId(req, app.get("env"));

        var options = {
            uri: endpoints.addressUrl,
            method: 'POST',
            json: true,
            body: req.body
        };
        console.log("Posting Address: " + JSON.stringify(req.body));
        req.session.lastBody = req.body;

        var tracer = global.tracer;
        tracer.local('pay-me', () => {

        var request = wrapRequest(originalRequest, {tracer, serviceName, remoteServiceName});

        request(options, function(error, response, body) {
            if (error) {
                return next(error);
            }
            helpers.respondSuccessBody(res, JSON.stringify(body));
        }.bind({
            res: res
        }));
    });
    });

    app.get("/card", function(req, res, next) {
        var custId = helpers.getCustomerId(req, app.get("env"));
        var options = {
            uri: endpoints.customersUrl + '/' + custId + '/cards',
            method: 'GET',
        };

        var tracer = global.tracer;
        var request = wrapRequest(originalRequest, {tracer, serviceName, remoteServiceName});
        tracer.local('pay-me', () => {

        request(options, function(error, response, body) {
            if (error) {
                return next(error);
            }
            var data = JSON.parse(body);
            if (data.status_code !== 500 && data._embedded.card.length !== 0 ) {
                var resp = {
                    "number": data._embedded.card[0].longNum.slice(-4)
                };
                return helpers.respondSuccessBody(res, JSON.stringify(resp));
            }
            return helpers.respondSuccessBody(res, JSON.stringify({"status_code": 500}));
        }.bind({
            res: res
        }));
    });
    });

    app.get("/address", function(req, res, next) {
        var custId = helpers.getCustomerId(req, app.get("env"));
        var options = {
            uri: endpoints.customersUrl + '/' + custId + '/addresses',
            method: 'GET',
        };

        var tracer = global.tracer;
        var request = wrapRequest(originalRequest, {tracer, serviceName, remoteServiceName});
        
        tracer.local('pay-me', () => {

        request(options, function(error, response, body) {
            if (error) {
                return next(error);
            }
            var data = JSON.parse(body);
            if (data.status_code !== 500 && data._embedded.address.length !== 0 ) {
                var resp = data._embedded.address[0];
                return helpers.respondSuccessBody(res, JSON.stringify(resp));
            }
            return helpers.respondSuccessBody(res, JSON.stringify({"status_code": 500}));
        }.bind({
            res: res
        }));
    });
    });

    app.post("/cards", function(req, res, next) {
        req.body.userID = helpers.getCustomerId(req, app.get("env"));

        var options = {
            uri: endpoints.cardsUrl,
            method: 'POST',
            json: true,
            body: req.body
        };
        console.log("Posting Card: " + JSON.stringify(req.body));
        req.session.lastBody = req.body;

        var tracer = global.tracer;
        var request = wrapRequest(originalRequest, {tracer, serviceName, remoteServiceName});
        tracer.local('pay-me', () => {

        request(options, function(error, response, body) {
            if (error) {
                return next(error);
            }
            helpers.respondSuccessBody(res, JSON.stringify(body));
        }.bind({
            res: res
        }));
    });
    });

    // Delete Customer - TO BE USED FOR TESTING ONLY (for now)
    app.delete("/customers/:id", function(req, res, next) {
        console.log("Deleting Customer " + req.params.id);
        var options = {
            uri: endpoints.customersUrl + "/" + req.params.id,
            method: 'DELETE'
        };

        var tracer = global.tracer;
        var request = wrapRequest(originalRequest, {tracer, serviceName, remoteServiceName});

        tracer.local('pay-me', () => {

        request(options, function(error, response, body) {
            if (error) {
                return next(error);
            }
            helpers.respondSuccessBody(res, JSON.stringify(body));
        }.bind({
            res: res
        }));
    });
    });

    // Delete Address - TO BE USED FOR TESTING ONLY (for now)
    app.delete("/addresses/:id", function(req, res, next) {
        console.log("Deleting Address " + req.params.id);
        var options = {
            uri: endpoints.addressUrl + "/" + req.params.id,
            method: 'DELETE'
        };

        var tracer = global.tracer;
        var request = wrapRequest(originalRequest, {tracer, serviceName, remoteServiceName});
        tracer.local('pay-me', () => {

        request(options, function(error, response, body) {
            if (error) {
                return next(error);
            }
            helpers.respondSuccessBody(res, JSON.stringify(body));
        }.bind({
            res: res
        }));
    });
    });

    // Delete Card - TO BE USED FOR TESTING ONLY (for now)
    app.delete("/cards/:id", function(req, res, next) {
        console.log("Deleting Card " + req.params.id);
        var options = {
            uri: endpoints.cardsUrl + "/" + req.params.id,
            method: 'DELETE'
        };

        var tracer = global.tracer;
        var request = wrapRequest(originalRequest, {tracer, serviceName, remoteServiceName});
        tracer.local('pay-me', () => {

        request(options, function(error, response, body) {
            if (error) {
                return next(error);
            }
            helpers.respondSuccessBody(res, JSON.stringify(body));
        }.bind({
            res: res
        }));
    });
    });

    app.post("/register", function(req, res, next) {
        var options = {
            uri: endpoints.registerUrl,
            method: 'POST',
            json: true,
            body: req.body
        };

        console.log("Posting Customer: " + JSON.stringify(req.body));
        req.session.lastBody = req.body;


        async.waterfall([
                function(callback) {

                    var tracer = global.tracer;
                    var request = wrapRequest(originalRequest, {tracer, serviceName, remoteServiceName});
                    tracer.local('pay-me', () => {

                    request(options, function(error, response, body) {
                        if (error !== null ) {
                            callback(error);
                            return;
                        }
                        if (response.statusCode == 200 && body != null && body != "") {
                            if (body.error) {
                                callback(body.error);
                                return;
                            }
                            console.log(body);
                            var customerId = body.id;
                            console.log(customerId);
                            req.session.customerId = customerId;
                            callback(null, customerId);
                            return;
                        }
                        console.log(response.statusCode);
                        callback(true);
                    });
                });
                },
                function(custId, callback) {
                    var sessionId = req.session.id;
                    console.log("Merging carts for customer id: " + custId + " and session id: " + sessionId);

                    var options = {
                        uri: endpoints.cartsUrl + "/" + custId + "/merge" + "?sessionId=" + sessionId,
                        method: 'GET'
                    };

                    var tracer = global.tracer;
                    var request = wrapRequest(originalRequest, {tracer, serviceName, remoteServiceName});
                    tracer.local('pay-me', () => {

                    request(options, function(error, response, body) {
                        if (error) {
                            if(callback) callback(error);
                            return;
                        }
                        console.log('Carts merged.');
                        if(callback) callback(null, custId);
                    });
                });
                }
            ],
            function(err, custId) {
                if (err) {
                    console.log("Error with log in: " + err);
                    res.status(500);
                    res.end();
                    return;
                }
                console.log("set cookie" + custId);
                res.status(200);
                res.cookie(cookie_name, req.session.id, {
                    maxAge: 3600000
                }).send({id: custId});
                console.log("Sent cookies.");
                res.end();
                return;
            }
        );
    });

    app.get("/login", function(req, res, next) {
        console.log("Received login request");

        async.waterfall([
                function(callback) {
                    var options = {
                        headers: {
                            'Authorization': req.get('Authorization')
                        },
                        uri: endpoints.loginUrl
                    };

                    var tracer = global.tracer;
                    var request = wrapRequest(originalRequest, {tracer, serviceName, remoteServiceName});
                    tracer.local('pay-me', () => {

                    request(options, function(error, response, body) {
                        if (error) {
                            callback(error);
                            return;
                        }
                        if (response.statusCode == 200 && body != null && body != "") {
                            console.log(body);
                            var customerId = JSON.parse(body).user.id;
                            console.log(customerId);
                            req.session.customerId = customerId;
                            callback(null, customerId);
                            return;
                        }
                        console.log(response.statusCode);
                        callback(true);
                    });
                });
                },
                function(custId, callback) {
                    var sessionId = req.session.id;
                    console.log("Merging carts for customer id: " + custId + " and session id: " + sessionId);

                    var options = {
                        uri: endpoints.cartsUrl + "/" + custId + "/merge" + "?sessionId=" + sessionId,
                        method: 'GET'
                    };

                    var tracer = global.tracer;
                    var request = wrapRequest(originalRequest, {tracer, serviceName, remoteServiceName});
                    
                    tracer.local('pay-me', () => {

                    request(options, function(error, response, body) {
                        if (error) {
                            // if cart fails just log it, it prevenst login
                            console.log(error);
                            //return;
                        }
                        console.log('Carts merged.');
                        callback(null, custId);
                    });
                });
                }
            ],
            function(err, custId) {
                if (err) {
                    console.log("Error with log in: " + err);
                    res.status(401);
                    res.end();
                    return;
                }
                res.status(200);
                res.cookie(cookie_name, req.session.id, {
                    maxAge: 3600000
                }).send('Cookie is set');
                console.log("Sent cookies.");
                res.end();
                return;
            });
    });

    module.exports = app;
}());
