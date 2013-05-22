/*jslint node: true */
(function () {
    "use strict";

    var zlib = require('zlib'),
        sys = require("sys"),
        http = require("http"),
        path = require("path"),
        filesys = require("fs"),
        url = require("url"),

        hostname = "localhost",
        port = 8080,
        defaultfile = "index.htm",

        matchPart = /(<\%=)(\s+)?part\(['"][\w\.\/]+['"]\)(\s+)?(\%>)/g,

        util,
        resp;

    resp = {
        gzip : function (data, response) {
            var buffe = new Buffer(data, 'utf-8');

            zlib.gzip(buffe, function () {
                var args = arguments,
                    result = args[1];

                response.end(result);
            });
        },
        "200" : function (response, data, headers) {
            var isHtml = (headers["Content-Type"] === "text/html"),
                parts,
                fileString;

            response.writeHead(200, headers);

            if (isHtml) {
                fileString = data.toString("utf-8");
                parts = fileString.match(matchPart);

                if (parts) {
                    util.getParts(fileString, parts, response, 0);
                } else {
                    resp.gzip(data, response);
                }
            } else {
                resp.gzip(data, response);
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
        getPart : function (fileString, parts, response, i) {
            var partUrl = parts[i].match(/["'][\w\_\/\.]+["']/).join().replace(/['"]/g, ""),
                fullPath = path.join(process.cwd(), partUrl),
                nextIndex = parseInt(i + 1, 10),
                newFileString = fileString,
                htmlPart;

            filesys.readFile(fullPath, function (error, data) {
                if (!error) {
                    htmlPart = data.toString("utf-8");

                    newFileString = fileString.replace(parts[i], htmlPart);
                }

                util.getParts(newFileString, parts, response, nextIndex);
            });
        },
        getParts : function (fileString, parts, response, i) {
            var index = i || 0,
                length = parts.length,
                hasParts = fileString.match(matchPart);

            if (index < length) {
                util.getPart(fileString, parts, response, index);
            } else if (index === length && hasParts) {
                util.getPart(fileString, hasParts, response, 0);
            } else {
                resp.gzip(fileString, response);
            }
        },
        getType : function (fullPath) {
            var type = "text/plain",
                tlc = fullPath.toLowerCase(),

                isHtml = /\.htm[l]?$/.test(tlc),
                isCss = /\.css$/.test(tlc),
                isSvg = /\.svg/.test(tlc);

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
        readFile : function (fullPath, response, headers) {
            filesys.readFile(fullPath, function (error, data) {
                if (error) {
                    resp["500"](response, error, headers);
                } else {
                    resp["200"](response, data, headers);
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
                    util.readFile(fullPath, response, headers);
                }
            });
        }
    };

    exports.server = http.createServer(util.createServer).listen(port, hostname);

    sys.puts("Server Running on " + hostname + ":" + port);
}());