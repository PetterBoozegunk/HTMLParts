/*jslint node: true */
/*global require, Buffer */
(function () {
    "use strict";

    var http = require("http"),

        settings = require("./server/settings.json"),
        server = require("./server/server.js");

    console.log(server);

    http.createServer(server.create).listen(settings.port, settings.hostname);

    console.log("Server Running on http://" + settings.hostname + ":" + settings.port);
}());