
var RnRObject = function (request, response) {
        this.init(request, response);
    },
    createRnRObject = function (request, response) { // RnR = Request aNd Response
        return new RnRObject(request, response);
    };

RnRObject.prototype = {
    gzip: function () {
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
    statCallback: function (error, callback) {
        var rnrObject = this,
            etag = this.setEtag(rnrObject, callback);

        this.cacheCheck(rnrObject, etag);
    },
    exists: function (exists) {
        var rnrObject = this;

        if (!exists) {
            server["404"](rnrObject);
        } else {
            rnrObject.contextCallback(rnrObject, fs.stat, ["." + rnrObject.request.url, rnrObject.statCallback]);
        }
    },
    readFileCallback: function (error, data) {
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
    readFileInclude: function (error, data) {
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
    contextCallback: function (context, func, argsArray) {
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

exports = createRnRObject;