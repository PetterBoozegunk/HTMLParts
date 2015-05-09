/*jslint node: true */
/*global require, Buffer */
(function () {
    "use strict";

    var settings = require("./server.settings.json"),

        zlib = require("zlib"),
        http = require("http"),
        path = require("path"),
        fs = require("fs"),
        url = require("url"),

        matchLayout = /(<!--([\s]+)?layout\(['"]?[\w\_\.\/]+['"]?\)([\s]+)?-->)/g,
        matchIncludes = /(<!--([\s]+)?include\(['"]?[\w\_\.\/]+['"]?\)([\s]+)?-->)/g,

        mimetypes = require("./mimetypes.json"),

        // ReSharper disable once JoinDeclarationAndInitializerJs (This cannot be done here... But anyone is welcome to try.)
        server,
        resp = {
            gzip: function (rnrObject) {
                var buffe = new Buffer(rnrObject.data, "utf-8");

                zlib.gzip(buffe, rnrObject.gzip);
            },
            "200": function (rnrObject) {
                var isPHtml = (rnrObject.headers["isPHtml"]);

                rnrObject.headers.ETag = rnrObject.etag;

                delete rnrObject.headers["isPHtml"];

                if (isPHtml) {
                    rnrObject.data = rnrObject.data.toString("utf-8");
                    rnrObject.layout = rnrObject.data.match(matchLayout);
                    rnrObject.includes = rnrObject.data.match(matchIncludes);

                    if (rnrObject.layout) {
                        rnrObject.layout = rnrObject.layout.join();

                        server.getLayout(rnrObject);
                    } else if (rnrObject.includes) {
                        server.getIncludes(rnrObject, 0);
                    } else {
                        resp.gzip(rnrObject);
                    }
                } else {
                    resp.gzip(rnrObject);
                }
            },
            "404": function (rnrObject) {
                rnrObject.data = "404 Not Found\n";
                resp.gzip(rnrObject);
            },
            "500": function (rnrObject) {
                resp.gzip(rnrObject);
            }
        },
        // ReSharper disable once InconsistentNaming (RnRObject is a constructor but Reshaper does not get that for some reason...)
        RnRObject = function (request, response) {
            var that = this;

            this.request = request;
            this.response = response;
            this.reqUrl = (that.request.url === "/") ? "/" + settings.defaultfile : that.request.url;
            this.pathName = url.parse(that.reqUrl).pathname;
            this.fullPath = path.join(process.cwd(), that.pathName);
            this.headers = server.getHeaders(that.fullPath);

            this.statCallback = function () {
                var args = arguments,
                    stat = args[1],
                    etag = stat ? stat.size + "-" + Date.parse(stat.mtime) : "";

                if (etag) {
                    that.headers["Last-Modified"] = stat.mtime;
                    that.etag = etag;
                }

                if (request.headers["if-none-match"] === etag) {
                    response.statusCode = 304;
                    response.end();
                } else {
                    that.readFile(that);
                }
            };

            this.exists = function (exists) {
                if (!exists) {
                    that.statusCode = 404;
                    resp["404"](that);
                } else {
                    fs.stat("." + request.url, that.statCallback);
                }
            };

            this.readFile = function (rnrObject) {
                fs.readFile(rnrObject.fullPath, rnrObject.readFileCallback);
            };

            this.readFileCallback = function (error, data) {
                if (error) {
                    that.data = error + "\n";
                    that.statusCode = 500;
                    resp["500"](that);
                } else {
                    that.data = data;
                    that.statusCode = 200;
                    resp["200"](that);
                }
            };

            this.readFileInclude = function (error, data) {
                if (error) {
                    that.currentInclude = "<div style=\"color: red; background: #ffe2e7; padding: 5px 10px; border: solid 1px red;\">The file \"" + that.fullPath + "\" does not exist</div>";
                } else {
                    that.currentInclude = data.toString("utf-8");
                }

                that.newdata = that.data.replace(that.includes[0], that.currentInclude);
                that.data = that.newdata;
                server.getIncludes(that);
            };

            this.gzip = function () {
                var args = arguments,
                    result = args[1];

                that.headers["Content-Length"] = result.length;
                that.response.writeHead(that.statusCode, that.headers);
                that.response.end(result);
            };

            this.methodCallback = function (method, args) {
                var callback = (args.length && typeof args[args.length - 1] === "function") ? args[args.length - 1] : null,
                    newArgs = [];

                args.forEach(function (item, i) {
                    if (i < (args.length - 1) || (i === (args.length - 1) && typeof item !== "function")) {
                        newArgs.push(item);
                    }
                });

                if (callback) {
                    newArgs.push(function () {
                        callback.apply(that, arguments);
                    });
                }

                method.apply(that, newArgs);
            }

            this.contextCallback = function (context, func, argsArray) {
                var callback = argsArray[argsArray.length - 1];

                argsArray.pop();

                argsArray.push(function () {
                    var args = arguments;

                    callback.apply(context, args);
                });

                func.apply(context, argsArray);
            }
        },
        createRnRObject = function (request, response) {// RnR = Request aNd Response
            return new RnRObject(request, response);
        };

    server = {
        trim: function (str) {
            return str.toString().replace(/(^\s+|\s+$)/g, "");
        },
        setLayout: function (error, data) {
            var rnrObject = this,
                newData,
                fileContent;

            if (error) {
                rnrObject.data = error + "\n";
                rnrObject.statusCode = 500;
                resp["500"](rnrObject);
            } else {
                rnrObject.layoutData = data.toString("utf-8");
                fileContent = server.trim(rnrObject.data.replace(matchLayout, ""));
                newData = rnrObject.layoutData.replace(/<\!--\s\[htmlparts\:content\]\s-->/, fileContent);
                rnrObject.data = server.trim(newData);

                server.getIncludes(rnrObject);
            }
        },
        getLayout: function (rnrObject) {
            var layoutUrl = rnrObject.layout.match(/["'][\w\_\/\.]+["']/).join().replace(/['"]/g, ""),
                fullPath = path.join(process.cwd(), layoutUrl);

            rnrObject.contextCallback(rnrObject, fs.readFile, [fullPath, server.setLayout]);
        },
        getInclude: function (rnrObject) {
            var includeUrl = rnrObject.includes[0].match(/["'][\w\_\/\.]+["']/).join().replace(/['"]/g, ""),
                fullPath = path.join(process.cwd(), includeUrl);

            rnrObject.fullPath = fullPath;
            fs.readFile(fullPath, rnrObject.readFileInclude);
        },
        getIncludes: function (rnrObject) {
            var hasIncludes = rnrObject.data.match(matchIncludes);

            if (hasIncludes) {
                rnrObject.includes = hasIncludes;
                server.getInclude(rnrObject);
            } else {
                resp.gzip(rnrObject);
            }
        },
        getType: function (fullPath) {
            var type = "text/plain",
                tlc = fullPath.toLowerCase(),
                file = tlc.match(/\.[a-z\d]+$/);

            if (mimetypes[file] && mimetypes[file].length) {
                type = mimetypes[file][0];
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
                    "Expires": new Date(parseInt(year + 1, 10), month, date).toUTCString(),
                    "isPHtml" : (/\.phtml$/ig).test(fullPath)
                };

            return headers;
        },
        create: function (request, response) {
            var rnrObject = createRnRObject(request, response);

            rnrObject.methodCallback(fs.exists, [rnrObject.fullPath, rnrObject.exists]);
        }
    };

    http.createServer(server.create).listen(settings.port, settings.hostname);

    console.log("Server Running on http://" + settings.hostname + ":" + settings.port);
}());