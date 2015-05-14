// This is a test to see that a js file gtes the right mime-type.
(function (window) {

    if (window.console && window.console.log && typeof window.console.log === "function") {
        window.console.log("Test javascript");
    }

    return true;
}(window));