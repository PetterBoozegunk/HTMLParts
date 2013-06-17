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
        cache,
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

    cache = {
        watchFile : function (fullPath) {
            fs.watch(fullPath, function () {
                cache[fullPath]["Last-Modified"] = new Date();
            });
        },
        partsModified : function (fullPath) {
            var partsWasModified = false,
                inCache = cache[fullPath],
                lastAccessed,
                lastModified,
                partInCache,
                i,
                l;

            if (inCache && inCache.partsArray && inCache.partsArray.length) {
                l = inCache.partsArray.length;

                for (i = 0; i < l; i += 1) {
                    partInCache = cache[inCache.partsArray[i]];

                    lastAccessed = partInCache["Last-Accessed"];
                    lastModified = partInCache["Last-Modified"];

                    if (lastModified > lastAccessed) {
                        partsWasModified = true;
                        break;
                    }
                }
            }

            return partsWasModified;
        },
        add : function (fullPath, dataString) {
            var now = new Date();

            cache[fullPath] = {
                data : dataString || "",
                "Last-Modified" : now,
                "Last-Accessed" : now
            };
            cache.watchFile(fullPath);
        }
    };

    resp = {
        gzip : function (rnrObject) {
            var buffe = new Buffer(rnrObject.data, "utf-8");

            zlib.gzip(buffe, function () {
                var args = arguments,
                    result = args[1];

                rnrObject.headers["Content-Length"] = result.length;
                rnrObject.response.writeHead(rnrObject.statusCode, rnrObject.headers);

                if (cache[rnrObject.fullPath]) {
                    cache[rnrObject.fullPath].data = result;
                    cache[rnrObject.fullPath]["Last-Accessed"] = new Date();
                }

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
        getPart : function (rnrObject) {
            var  now = new Date(),
                partUrl = rnrObject.parts[0].match(/["'][\w\_\/\.]+["']/).join().replace(/['"]/g, ""),
                fullPath = path.join(process.cwd(), partUrl),
                newdata,
                inCache = cache[fullPath],
                htmlPart = inCache ? inCache.data : "",
                lastAccessed = inCache ? inCache["Last-Accessed"] : 0,
                lastModified = inCache ? inCache["Last-Modified"] : 0;

            if (inCache && (lastModified < lastAccessed)) {
                newdata = rnrObject.data.replace(rnrObject.parts[0], htmlPart);
                rnrObject.data = newdata;

                inCache["Last-Accessed"] = now;

                util.getParts(rnrObject);
            } else {
                fs.readFile(fullPath, function (error, data) {
                    if (error) {
                        htmlPart = "<div style=\"color: red; background: #ffe2e7; padding: 5px 10px; border: solid 1px red;\">The file \"" + fullPath + "\" does not exist</div>";
                    } else {
                        htmlPart = data.toString("utf-8");

                        if (!inCache) {
                            cache.add(fullPath, htmlPart);

                            if (!cache[rnrObject.fullPath].partsArray) {
                                cache[rnrObject.fullPath].partsArray = [];
                            }
                            cache[rnrObject.fullPath].partsArray.push(fullPath);
                        } else {
                            cache[fullPath].data = htmlPart;
                            inCache["Last-Accessed"] = now;
                            inCache["Last-Modified"] = now;
                        }
                    }

                    newdata = rnrObject.data.replace(rnrObject.parts[0], htmlPart);
                    rnrObject.data = newdata;

                    util.getParts(rnrObject);
                });
            }
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
                isSvg = /\.svg/i.test(tlc);

            if (isHtml) {
                type = "text/html";
            } else if (isCss) {
                type = "text/css";
            } else if (isSvg) {
                type = "image/svg+xml";
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
            var rnrObject = createRnRObject(request, response),
                inCache = cache[rnrObject.fullPath],
                etag = inCache ? cache[rnrObject.fullPath].etag : "",
                lastAccessed = inCache ? inCache["Last-Accessed"] : 0,
                lastModified = inCache ? inCache["Last-Modified"] : 0,
                partsModified = cache.partsModified(rnrObject.fullPath);

            if (inCache && (lastAccessed > lastModified) && !partsModified && etag && request.headers['if-none-match'] === etag) {
                response.statusCode = 304;
                response.end();
            } else {
                path.exists(rnrObject.fullPath, function (exists) {
                    if (!exists) {
                        rnrObject.statusCode = 404;
                        resp["404"](rnrObject);
                    } else {
                        fs.stat("." + request.url, function () {
                            var args = arguments,
                                stat = args[1];

                            etag = stat ? stat.size + "-" + Date.parse(stat.mtime) : "";

                            rnrObject.etag = etag;

                            if (!cache[rnrObject.fullPath]) {
                                cache.add(rnrObject.fullPath);
                            }
                            cache[rnrObject.fullPath].etag = etag;

                            util.readFile(rnrObject);
                        });
                    }
                });
            }
        }
    };

    exports.server = http.createServer(util.createServer).listen(webConfig.port, webConfig.hostname);

    sys.puts("Server Running on " + webConfig.hostname + ":" + webConfig.port);
}());