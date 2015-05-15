var path = require("path"),
    fs = require("fs"),

    matchLayout = /(<!--([\s]+)?layout\(['"]?[\w\_\.\/]+['"]?\)([\s]+)?-->)/g,
    matchIncludes = /(<!--([\s]+)?include\(['"]?[\w\_\.\/]+['"]?\)([\s]+)?-->)/g,

    phtml = {
        isPhtml: function (rnrObject) {
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
    };

exports = phtml;