﻿/*jslint node: true */

(function () {
    "use strict";

    var sys = require("sys"),
        http = require("http"),
        path = require("path"),
        filesys = require("fs"),
        url = require("url"),
        port = 8080,

        util,
        resp;

    resp = {
        "200" : function (response, data, headers) {
            var isHtml = (headers["Content-Type"] === "text/html"),
                parts,
                fileString;

            response.writeHead(200, headers);

            if (isHtml) {
                fileString = data.toString("utf-8");
                parts = fileString.match(/(<\%=)(\s+)?part\(['"][\w\.\/]+['"]\)(\s+)?(\%>)/g);

                if (parts) {
                    util.getParts(fileString, parts, response, 0);
                } else {
                    response.write(data);
                    response.end();
                }
            } else {
                response.write(data);
                response.end();
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
                var splitStr = fileString.toString("utf-8").split(parts[i]),
                    index,
                    length = splitStr.length;

                if (!error && splitStr.length > 1) {
                    htmlPart = data.toString("utf-8");

                    for (index = 0; index < length; index += 1) {
                        if (!index) {
                            newFileString = splitStr[index];
                        } else {
                            newFileString += htmlPart + splitStr[index];
                        }
                    }
                }

                util.getParts(newFileString, parts, response, nextIndex);
            });
        },
        getParts : function (fileString, parts, response, i) {
            var index = i || 0,
                length = parts.length,
                hasParts = fileString.match(/(<\%=)(\s+)?part\(['"][\w\.\/]+['"]\)(\s+)?(\%>)/g);

            if (index < length) {
                util.getPart(fileString, parts, response, index);
            } else if (index === length && hasParts) {
                util.getPart(fileString, hasParts, response, 0);
            } else {
                response.write(fileString);
                response.end();
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
            var type = util.getType(fullPath);

            return {
                "Content-Type": type
            };
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
            var reqUrl = (request.url === "/") ? "/index.htm" : request.url,
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

    http.createServer(util.createServer).listen(port);

    sys.puts("Server Running on http://127.0.0.1:" + port);
}());