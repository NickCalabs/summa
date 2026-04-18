const { createServer: createHttpsServer } = require("https");
const { createServer: createHttpServer } = require("http");
const { readFileSync, existsSync } = require("fs");
const { parse } = require("url");
const next = require("next");

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT || "3000", 10);
const app = next({ dev });
const handle = app.getRequestHandler();

const certDir = process.env.CERT_DIR || "/opt/summa/certs";
const hasCerts =
  existsSync(`${certDir}/server.crt`) && existsSync(`${certDir}/server.key`);

app.prepare().then(() => {
  const handler = (req, res) => {
    handle(req, res, parse(req.url, true));
  };

  if (hasCerts) {
    const httpsOptions = {
      key: readFileSync(`${certDir}/server.key`),
      cert: readFileSync(`${certDir}/server.crt`),
    };
    createHttpsServer(httpsOptions, handler).listen(port, () => {
      console.log(`> HTTPS ready on https://0.0.0.0:${port}`);
    });
  } else {
    console.warn("! No TLS certs found — falling back to HTTP");
    createHttpServer(handler).listen(port, () => {
      console.log(`> HTTP ready on http://0.0.0.0:${port}`);
    });
  }
});
