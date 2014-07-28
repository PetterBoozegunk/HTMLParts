/*jslint node: true */
(function () {
    "use strict";

    var webConfig = {
            hostname : "localhost",
            port : 8080,
            defaultfile : "index.htm"
        },
        zlib = require('zlib'),
        sys = require("sys"),
        http = require("http"),
        path = require("path"),
        fs = require("fs"),
        url = require("url"),

        matchPart = /(<\%=)(\s+)?part\(['"][\w\.\/]+['"]\)(\s+)?(\%>)/g,

        util,
        resp,
        createRnRObject; // RnR = Request aNd Response

    createRnRObject = function (request, response) {
        var rnrObject = {
            "request" : request,
            "response" : response
        };

        rnrObject.reqUrl = (rnrObject.request.url === "/") ? "/" + webConfig.defaultfile : rnrObject.request.url;
        rnrObject.pathName = url.parse(rnrObject.reqUrl).pathname;
        rnrObject.fullPath = path.join(process.cwd(), rnrObject.pathName);
        rnrObject.headers = util.getHeaders(rnrObject.fullPath);

        return rnrObject;
    };

    resp = {
        gzip : function (rnrObject) {
            var buffe = new Buffer(rnrObject.data, "utf-8");

            zlib.gzip(buffe, function () {
                var args = arguments,
                    result = args[1];

                rnrObject.headers["Content-Length"] = result.length;
                rnrObject.response.writeHead(rnrObject.statusCode, rnrObject.headers);

                rnrObject.response.end(result);
            });
        },
        "200" : function (rnrObject) {
            var isHtml = (rnrObject.headers["Content-Type"] === "text/html");

            rnrObject.headers.ETag = rnrObject.etag;

            if (isHtml) {
                rnrObject.data = rnrObject.data.toString("utf-8");
                rnrObject.parts = rnrObject.data.match(matchPart);

                if (rnrObject.parts) {
                    util.getParts(rnrObject, 0);
                } else {
                    resp.gzip(rnrObject);
                }
            } else {
                resp.gzip(rnrObject);
            }
        },
        "404" : function (rnrObject) {
            rnrObject.data = "404 Not Found\n";
            resp.gzip(rnrObject);
        },
        "500" : function (rnrObject) {
            resp.gzip(rnrObject);
        }
    };

    util = {
        trim : function (str) {
            return str.toString().replace(/(^\s+|\s+$)/g, "");
        },
        getPart : function (rnrObject) {
            var partUrl = rnrObject.parts[0].match(/["'][\w\_\/\.]+["']/).join().replace(/['"]/g, ""),
                fullPath = path.join(process.cwd(), partUrl),
                newdata,
                htmlPart;

            fs.readFile(fullPath, function (error, data) {
                if (error) {
                    htmlPart = "<div style=\"color: red; background: #ffe2e7; padding: 5px 10px; border: solid 1px red;\">The file \"" + fullPath + "\" does not exist</div>";
                } else {
                    htmlPart = data.toString("utf-8");
                }

                newdata = rnrObject.data.replace(rnrObject.parts[0], htmlPart);
                rnrObject.data = newdata;

                util.getParts(rnrObject);
            });
        },
        getParts : function (rnrObject) {
            var hasParts = rnrObject.data.match(matchPart);

            rnrObject.parts = hasParts;

            if (hasParts) {
                util.getPart(rnrObject);
            } else {
                resp.gzip(rnrObject);
            }
        },
        getType : function (fullPath) {
            var type = "text/plain",
                tlc = fullPath.toLowerCase(),

                isHtml = /\.htm[l]?$/i.test(tlc),
                isCss = /\.css$/i.test(tlc),
                isSvg = /\.svg/i.test(tlc),
                isJs = /\.js$/i.test(tlc);

            if (isHtml) {
                type = "text/html";
            } else if (isCss) {
                type = "text/css";
            } else if (isSvg) {
                type = "image/svg+xml";
            } else if (isJs) {
                type = "text/javascript";
            }

            return type;
        },
        getHeaders : function (fullPath) {
            var type = util.getType(fullPath),

                now = new Date(),
                year = now.getFullYear(),
                month = now.getMonth(),
                date = now.getDate(),

                headers = {
                    "Content-Type": type,
                    "Content-Encoding": "gzip",
                    "Cache-Control": "public, max-age=345600", // 4 days
                    "Date": now.toUTCString(),
                    "Expires": new Date(parseInt(year + 1, 10), month, date).toUTCString()
                };

            return headers;
        },
        readFile : function (rnrObject) {
            fs.readFile(rnrObject.fullPath, function (error, data) {
                if (error) {
                    rnrObject.data = error + "\n";
                    rnrObject.statusCode = 500;
                    resp["500"](rnrObject);
                } else {
                    rnrObject.data = data;
                    rnrObject.statusCode = 200;
                    resp["200"](rnrObject);
                }
            });
        },
        createServer : function (request, response) {
            var rnrObject = createRnRObject(request, response);

            path.exists(rnrObject.fullPath, function (exists) {
                if (!exists) {
                    rnrObject.statusCode = 404;
                    resp["404"](rnrObject);
                } else {
                    fs.stat("." + request.url, function () {
                        var args = arguments,
                            stat = args[1],
                            etag = stat ? stat.size + "-" + Date.parse(stat.mtime) : "";

                        if (etag) {
                            rnrObject.headers['Last-Modified'] = stat.mtime;
                            rnrObject.etag = etag;
                        }

                        if (request.headers['if-none-match'] === etag) {
                            response.statusCode = 304;
                            response.end();
                        } else {
                            util.readFile(rnrObject);
                        }
                    });
                }
            });
        }
    };

    http.createServer(util.createServer).listen(webConfig.port, webConfig.hostname);

    sys.puts("Server Running on http://" + webConfig.hostname + ":" + webConfig.port);
}());