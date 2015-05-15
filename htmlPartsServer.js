/*jslint node: true */
/*global require, Buffer */
(function () {
    "use strict";

    var settings = require("./server/settings.json"),
        mimetypes = require("./server/mimetypes.json"),

        zlib = require("zlib"),
        http = require("http"),
        path = require("path"),
        fs = require("fs"),
        url = require("url"),

        matchLayout = /(<!--([\s]+)?layout\(['"]?[\w\_\.\/]+['"]?\)([\s]+)?-->)/g,
        matchIncludes = /(<!--([\s]+)?include\(['"]?[\w\_\.\/]+['"]?\)([\s]+)?-->)/g,

// ReSharper disable once JoinDeclarationAndInitializerJs
        server,

        phtml = {
            setupLayout: function (rnrObject, data) {
                var layoutData = data.toString("utf-8"),
                    fileContent = rnrObject.data.replace(matchLayout, "").trim(),
                    newData = layoutData.replace(/<\!--\s\[phtml\:content\]\s-->/, fileContent);

                rnrObject.data = newData.trim();

                phtml.getIncludes(rnrObject);
            },
            setLayout: function (error, data) {
                var rnrObject = this;

                if (error) {
                    server["500"](rnrObject, error);
                } else {
                    phtml.setupLayout(rnrObject, data);
                }
            },
            getLayout: function (rnrObject) {
                var layoutUrl = rnrObject.layout.match(/["'][\w\_\/\.]+["']/).join().replace(/['"]/g, ""),
                    fullPath = path.join(process.cwd(), layoutUrl);

                rnrObject.contextCallback(rnrObject, fs.readFile, [fullPath, phtml.setLayout]);
            },
            getInclude: function (rnrObject) {
                var includeUrl = rnrObject.includes[0].match(/["'][\w\_\/\.]+["']/).join().replace(/['"]/g, ""),
                    fullPath = path.join(process.cwd(), includeUrl);

                rnrObject.fullPath = fullPath;
                rnrObject.contextCallback(rnrObject, fs.readFile, [fullPath, rnrObject.readFileInclude]);
            },
            getIncludes: function (rnrObject) {
                var hasIncludes = rnrObject.data.match(matchIncludes);

                if (hasIncludes) {
                    rnrObject.includes = hasIncludes;
                    phtml.getInclude(rnrObject);
                } else {
                    server.gzip(rnrObject);
                }
            },
            setup: function (rnrObject) {
                rnrObject.data = rnrObject.data.toString("utf-8");

                rnrObject.layout = rnrObject.data.match(matchLayout);
                rnrObject.includes = rnrObject.data.match(matchIncludes);

                if (rnrObject.layout) {
                    rnrObject.layout = rnrObject.layout.join();

                    phtml.getLayout(rnrObject);
                } else if (rnrObject.includes) {
                    phtml.getIncludes(rnrObject, 0);
                } else {
                    server.gzip(rnrObject);
                }
            },
            isPhtml : function (rnrObject) {
                return /\.phtml$/.test(rnrObject.fullPath);
            }
        },

// ReSharper disable once InconsistentNaming
        RnRObject = function (request, response) {
            var that = this;

            this.request = request;
            this.response = response;
            this.reqUrl = (that.request.url === "/") ? "/" + settings.defaultfile : that.request.url;
            this.pathName = url.parse(that.reqUrl).pathname;
            this.fullPath = path.join(process.cwd(), that.pathName);
            this.headers = server.getHeaders(that.fullPath);
        },
        createRnRObject = function (request, response) {// RnR = Request aNd Response
            return new RnRObject(request, response);
        };

    RnRObject.prototype = {
        gzip : function () {
            var rnrObject = this,
                args = arguments,
                result = args[1];

            rnrObject.headers["Content-Length"] = result.length;
            rnrObject.response.writeHead(rnrObject.statusCode, rnrObject.headers);
            rnrObject.response.end(result);
        },
        statCallback : function () {
            var rnrObject = this,
                args = arguments,
                stat = args[1],
                etag = stat ? stat.size + "-" + Date.parse(stat.mtime) : "";

            if (etag) {
                rnrObject.headers["Last-Modified"] = stat.mtime;
                rnrObject.etag = etag;
            }

            if (rnrObject.request.headers["if-none-match"] === etag) {
                rnrObject.response.statusCode = 304;
                rnrObject.response.end();
            } else {
                rnrObject.contextCallback(rnrObject, fs.readFile, [rnrObject.fullPath, rnrObject.readFileCallback]);
            }
        },
        exists : function (exists) {
            var rnrObject = this;

            if (!exists) {
                server["404"](rnrObject);
            } else {
                rnrObject.contextCallback(rnrObject, fs.stat, ["." + rnrObject.request.url, rnrObject.statCallback]);
            }
        },
        readFileCallback : function (error, data) {
            var rnrObject = this;

            if (error) {
                server["500"](rnrObject, error);
            } else {
                rnrObject.data = data;
                rnrObject.statusCode = 200;
                server["200"](rnrObject);
            }
        },
        readFileInclude : function (error, data) {
            var rnrObject = this;

            if (error) {
                rnrObject.currentInclude = "<div style=\"color: red; background: #ffe2e7; padding: 5px 10px; border: solid 1px red;\">The file \"" + rnrObject.fullPath + "\" does not exist</div>";
            } else {
                rnrObject.currentInclude = data.toString("utf-8");
            }

            rnrObject.newdata = rnrObject.data.replace(rnrObject.includes[0], rnrObject.currentInclude);
            rnrObject.data = rnrObject.newdata;
            phtml.getIncludes(rnrObject);
        },
        contextCallback : function (context, func, argsArray) {
            var callback = (argsArray instanceof Array && argsArray.length) ? argsArray[argsArray.length - 1] : null;

            if (typeof callback === "function") {
                argsArray.pop();

                argsArray.push(function () {
                    var args = arguments;

                    callback.apply(context, args);
                });
            }

            func.apply(context, argsArray);
        }
    };

    server = {
        gzip: function (rnrObject) {
// ReSharper disable once UndeclaredGlobalVariableUsing
            var buffe = new Buffer(rnrObject.data, "utf-8");

            rnrObject.headers.ETag = rnrObject.etag;

            rnrObject.contextCallback(rnrObject, zlib.gzip, [buffe, rnrObject.gzip]);
        },
        "200": function (rnrObject) {
            if (phtml.isPhtml(rnrObject)) {
                phtml.setup(rnrObject);
            } else {
                server.gzip(rnrObject);
            }
        },
        "404": function (rnrObject) {
            rnrObject.data = "404 - file not found";

            rnrObject.statusCode = 404;
            server.gzip(rnrObject);
        },
        "500": function (rnrObject, error) {
            rnrObject.data = (error || "Server error") + "\n";

            rnrObject.statusCode = 500;
            server.gzip(rnrObject);
        },
        getType: function (fullPath) {
            var type = "text/plain",
                tlc = fullPath.toLowerCase(),
                file = tlc.match(/\.[a-z\d]+$/);

            if (mimetypes[file]) {
                type = mimetypes[file];
            }

            return type;
        },
        getHeaders: function (fullPath) {
            var type = server.getType(fullPath),

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
        create: function (request, response) {
            var rnrObject = createRnRObject(request, response);

            rnrObject.contextCallback(rnrObject, fs.exists, [rnrObject.fullPath, rnrObject.exists]);
        }
    };

    http.createServer(server.create).listen(settings.port, settings.hostname);

    console.log("Server Running on http://" + settings.hostname + ":" + settings.port);
}());