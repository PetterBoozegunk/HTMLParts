var zlib = require("zlib"),
    settings = require("./settings.json"),
    mimetypes = require("./mimetypes.json"),

    createRnRObject = require("./rnrObject.js"),

    server = {
        gzip: function (rnrObject) {
            var buffe = new Buffer(rnrObject.data, "utf-8");

            rnrObject.headers.ETag = rnrObject.etag;

            rnrObject.contextCallback(rnrObject, zlib.gzip, [buffe, rnrObject.gzip]);
        },
        set200: function (rnrObject, data) {
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
        headers: {
            getType: function (fullPath) {
                var type = "text/plain",
                    file = fullPath.toLowerCase().match(/\.[a-z\d]+$/);

                if (mimetypes[file]) {
                    type = mimetypes[file];
                }

                return type;
            },
            setExpires: function (now, headers) {
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

            console.log(request, response);

            var rnrObject = createRnRObject(request, response);

            rnrObject.contextCallback(rnrObject, fs.exists, [rnrObject.fullPath, rnrObject.exists]);
        }
    };

exports = server;