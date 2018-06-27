var request = require("request"),
  express = require("express"),
  morgan = require("morgan"),
  path = require("path"),
  bodyParser = require("body-parser"),
  async = require("async"),
  cookieParser = require("cookie-parser"),
  session = require("express-session"),
  config = require("./config"),
  helpers = require("./helpers"),
  cart = require("./api/cart"),
  catalogue = require("./api/catalogue"),
  orders = require("./api/orders"),
  user = require("./api/user"),
  metrics = require("./api/metrics");
  
const zipkin = require("zipkin");
const {Tracer, ExplicitContext, ConsoleRecorder} = require('zipkin');
const zipkinMiddleware = require('zipkin-instrumentation-express').expressMiddleware;

const CLSContext = require("zipkin-context-cls");
const ctxImpl = new CLSContext();

var port = process.env.ZIPKIN_PORT;
var host = process.env.ZIPKIN_HOST;
const zipkinUrl = `http://${host}:${port}`;

const recorder = new BatchRecorder({
  logger: new HttpLogger({
    endpoint: `${zipkinUrl}/rest/api/v2/spans`,
    jsonEncoder: JSON_V2
  })
});

tracer = new zipkin.Tracer({
  ctxImpl,
  recorder: recorder,
  sampler: new zipkin.sampler.CountingSampler(1), // sample rate 0.01 will sample 1 % of all incoming requests
  traceId128Bit: false // to generate 128-bit trace IDs.
});
global.tracer = tracer;

const app = express();
app.use(zipkinMiddleware({tracer}));

app.use(helpers.rewriteSlash);
app.use(metrics);
app.use(express.static("public"));
if (process.env.SESSION_REDIS) {
  console.log("Using the redis based session manager");
  app.use(session(config.session_redis));
} else {
  console.log("Using local session manager");
  app.use(session(config.session));
}

app.use(bodyParser.json());
app.use(cookieParser());
app.use(helpers.sessionMiddleware);
app.use(morgan("dev", {}));

var domain = "";
process.argv.forEach(function(val, index, array) {
  var arg = val.split("=");
  if (arg.length > 1) {
    if (arg[0] == "--domain") {
      domain = arg[1];
      console.log("Setting domain to:", domain);
    }
  }
});

/* Mount API endpoints */
app.use(cart);
app.use(catalogue);
app.use(orders);
app.use(user);

app.use(helpers.errorHandler);

var server = app.listen(process.env.PORT || 8079, function() {
  var port = server.address().port;
  console.log("App now running in %s mode on port %d", app.get("env"), port);
});

