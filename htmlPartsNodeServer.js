/*jslint node: true */
(function () {
    "use strict";

    var zlib = require('zlib'),
        sys = require("sys"),
        http = require("http"),
        path = require("path"),
        fs = require("fs"),
        url = require("url"),

        hostname = "localhost",
        port = 8080,
        defaultfile = "index.htm",

        matchPart = /(<\%=)(\s+)?part\(['"][\w\.\/]+['"]\)(\s+)?(\%>)/g,

        util,
        resp,

        partFiles;

    partFiles = {
        changed : false,
        watch : {}
    };

    resp = {
        gzip : function (data, response, headers) {
            var buffe = new Buffer(data, "utf-8");

            zlib.gzip(buffe, function () {
                var args = arguments,
                    result = args[1];

                response.setHeader('Content-Length', result.length);
                response.writeHead(200, headers);

                partFiles.changed = false;
                response.end(result);
            });
        },
        "200" : function (response, data, headers, etag) {
            var isHtml = (headers["Content-Type"] === "text/html"),
                parts,
                fileString;

            response.setHeader('ETag', etag);

            if (isHtml) {
                fileString = data.toString("utf-8");
                parts = fileString.match(matchPart);

                if (parts) {
                    util.getParts(fileString, parts, response, 0, headers);
                } else {
                    resp.gzip(data, response, headers);
                }
            } else {
                resp.gzip(data, response, headers);
            }
        },
        "404" : function (response, headers) {
            response.writeHead(404, headers);
            response.write("404 Not Found\n");
            response.end();
        },
        "500" : function (response, error, headers) {
            response.writeHead(500, headers);
            response.write(error + "\n");
            response.end();
        }
    };

    util = {
        getPart : function (fileString, parts, response, i, headers) {
            var partUrl = parts[i].match(/["'][\w\_\/\.]+["']/).join().replace(/['"]/g, ""),
                fullPath = path.join(process.cwd(), partUrl),
                nextIndex = parseInt(i + 1, 10),
                newFileString = fileString,
                htmlPart;

            fs.readFile(fullPath, function (error, data) {
                if (error) {
                    htmlPart = "<div style=\"color: red; background: #ffe2e7; padding: 5px 10px; border: solid 1px red;\">The file \"" + fullPath + "\" does not exist</div>";
                } else {
                    htmlPart = data.toString("utf-8");

                    if (!partFiles.watch[fullPath]) {
                        partFiles.watch[fullPath] = true;

                        fs.watch(fullPath, function () {
                            partFiles.changed = true;
                        });
                    }
                }

                newFileString = fileString.replace(parts[i], htmlPart);

                util.getParts(newFileString, parts, response, nextIndex, headers);
            });
        },
        getParts : function (fileString, parts, response, i, headers) {
            var index = i || 0,
                length = parts.length,
                hasParts = fileString.match(matchPart);

            if (index < length) {
                util.getPart(fileString, parts, response, index, headers);
            } else if (index === length && hasParts) {
                util.getPart(fileString, hasParts, response, 0, headers);
            } else {
                resp.gzip(fileString, response, headers);
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
        readFile : function (fullPath, response, headers, etag) {
            fs.readFile(fullPath, function (error, data) {
                if (error) {
                    resp["500"](response, error, headers);
                } else {
                    resp["200"](response, data, headers, etag);
                }
            });
        },
        createServer : function (request, response) {
            var reqUrl = (request.url === "/") ? "/" + defaultfile : request.url,
                pathName = url.parse(reqUrl).pathname,
                fullPath = path.join(process.cwd(), pathName),
                headers = util.getHeaders(fullPath);

            path.exists(fullPath, function (exists) {
                if (!exists) {
                    resp["404"](response, headers);
                } else {
                    fs.stat("." + request.url, function () {
                        var args = arguments,
                            stat = args[1],
                            etag = stat ? stat.size + "-" + Date.parse(stat.mtime) : "";

                        if (stat) {
                            response.setHeader('Last-Modified', stat.mtime);
                        }

                        if (!partFiles.changed && etag && request.headers['if-none-match'] === etag) {
                            response.statusCode = 304;
                            response.end();
                        } else {
                            util.readFile(fullPath, response, headers, etag);
                        }
                    });
                }
            });
        }
    };

    exports.server = http.createServer(util.createServer).listen(port, hostname);

    sys.puts("Server Running on " + hostname + ":" + port);
}());