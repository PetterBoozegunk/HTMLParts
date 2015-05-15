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
            isPhtml : function (rnrObject) {
                return /\.phtml$/.test(rnrObject.fullPath);
            },
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
                rnrObject.includes = rnrObject.data.match(matchIncludes);

                if (rnrObject.includes) {
                    phtml.getInclude(rnrObject);
                } else {
                    server.gzip(rnrObject);
                }
            },
            checkLayout: function (rnrObject) {
                if (rnrObject.layout) {
                    rnrObject.layout = rnrObject.layout.join();

                    phtml.getLayout(rnrObject);
                } else {
                    phtml.getIncludes(rnrObject, 0);
                }
            },
            setup: function (rnrObject) {
                rnrObject.data = rnrObject.data.toString("utf-8");

                rnrObject.layout = rnrObject.data.match(matchLayout);

                phtml.checkLayout(rnrObject);
            }
        },

// ReSharper disable once InconsistentNaming
        RnRObject = function (request, response) {
            this.init(request, response);
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
        setEtag: function (rnrObject, stat) {
            var etag = stat ? stat.size + "-" + Date.parse(stat.mtime) : "";

            if (etag) {
                rnrObject.headers["Last-Modified"] = stat.mtime;
                rnrObject.etag = etag;
            }

            return etag;
        },
        cacheCheck: function (rnrObject, etag) {
            if (rnrObject.request.headers["if-none-match"] === etag) {
                server["304"](rnrObject);
            } else {
                rnrObject.contextCallback(rnrObject, fs.readFile, [rnrObject.fullPath, rnrObject.readFileCallback]);
            }
        },
        statCallback : function (error, callback) {
            var rnrObject = this,
                etag = this.setEtag(rnrObject, callback);

            this.cacheCheck(rnrObject, etag);
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
                server["200"](rnrObject, data);
            }
        },
        setCurrentInclude: function (error, data) {
            var rnrObject = this;

            if (error) {
                rnrObject.currentInclude = "<div style=\"color: red; background: #ffe2e7; padding: 5px 10px; border: solid 1px red;\">The file \"" + rnrObject.fullPath + "\" does not exist</div>";
            } else {
                rnrObject.currentInclude = data.toString("utf-8");
            }
        },
        readFileInclude : function (error, data) {
            var rnrObject = this;

            this.setCurrentInclude(error, data);

            rnrObject.newdata = rnrObject.data.replace(rnrObject.includes[0], rnrObject.currentInclude);
            rnrObject.data = rnrObject.newdata;

            phtml.getIncludes(rnrObject);
        },

        setContextCallbackArgsArray: function (context, argsArray, callback) {
            argsArray.pop();

            argsArray.push(function () {
                var args = arguments;

                callback.apply(context, args);
            });

            return argsArray;
        },
        contextCallback : function (context, func, argsArray) {
            var callback = (argsArray instanceof Array && argsArray.length) ? argsArray[argsArray.length - 1] : null;

            if (typeof callback === "function") {
                argsArray = this.setContextCallbackArgsArray(context, argsArray, callback);
            }

            func.apply(context, argsArray);
        },

        setPaths: function (rnrObject) {
            this.reqUrl = (rnrObject.request.url === "/") ? "/" + settings.defaultfile : rnrObject.request.url;
            this.pathName = url.parse(rnrObject.reqUrl).pathname;
            this.fullPath = path.join(process.cwd(), rnrObject.pathName);
        },
        setHeaders: function (rnrObject) {
            this.headers = server.headers.get(rnrObject.fullPath);
        },
        init: function (request, response) {
            var rnrObject = this;

            this.request = request;
            this.response = response;

            this.setPaths(rnrObject);
            this.setHeaders(rnrObject);
        }
    };

    server = {
        gzip: function (rnrObject) {
// ReSharper disable once UndeclaredGlobalVariableUsing
            var buffe = new Buffer(rnrObject.data, "utf-8");

            rnrObject.headers.ETag = rnrObject.etag;

            rnrObject.contextCallback(rnrObject, zlib.gzip, [buffe, rnrObject.gzip]);
        },
        set200 : function (rnrObject, data) {
            rnrObject.data = data;
            rnrObject.statusCode = 200;
        },
        "200": function (rnrObject, data) {
            server.set200(rnrObject, data);

            if (phtml.isPhtml(rnrObject)) {
                phtml.setup(rnrObject);
            } else {
                server.gzip(rnrObject);
            }
        },
        "304": function (rnrObject) {
            rnrObject.response.statusCode = 304;
            rnrObject.response.end();
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
        headers : {
            getType: function (fullPath) {
                var type = "text/plain",
                    file = fullPath.toLowerCase().match(/\.[a-z\d]+$/);

                if (mimetypes[file]) {
                    type = mimetypes[file];
                }

                return type;
            },
            setExpires : function (now, headers) {
                var year = now.getFullYear(),
                    month = now.getMonth(),
                    date = now.getDate();

                headers["Expires"] = new Date(parseInt(year + 1, 10), month, date).toUTCString();
            },
            setTime: function (headers) {
                var now = new Date();

                headers["Date"] = now.toUTCString();

                server.headers.setExpires(now, headers);
            },
            setup: function (fullPath) {
                var headers = {
                        "Content-Type": server.headers.getType(fullPath),
                        "Content-Encoding": "gzip",
                        "Cache-Control": "public, max-age=345600" // 4 days
                    };

                return headers;
            },
            get: function (fullPath) {
                var headers = server.headers.setup(fullPath);

                server.headers.setTime(headers);

                return headers;
            }
        },
        create: function (request, response) {
            var rnrObject = createRnRObject(request, response);

            rnrObject.contextCallback(rnrObject, fs.exists, [rnrObject.fullPath, rnrObject.exists]);
        }
    };

    http.createServer(server.create).listen(settings.port, settings.hostname);

    console.log("Server Running on http://" + settings.hostname + ":" + settings.port);
}());