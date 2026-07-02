module.exports = (function() {
var __MODS__ = {};
var __DEFINE__ = function(modId, func, req) { var m = { exports: {}, _tempexports: {} }; __MODS__[modId] = { status: 0, func: func, req: req, m: m }; };
var __REQUIRE__ = function(modId, source) { if(!__MODS__[modId]) return require(source); if(!__MODS__[modId].status) { var m = __MODS__[modId].m; m._exports = m._tempexports; var desp = Object.getOwnPropertyDescriptor(m, "exports"); if (desp && desp.configurable) Object.defineProperty(m, "exports", { set: function (val) { if(typeof val === "object" && val !== m._exports) { m._exports.__proto__ = val.__proto__; Object.keys(val).forEach(function (k) { m._exports[k] = val[k]; }); } m._tempexports = val }, get: function () { return m._tempexports; } }); __MODS__[modId].status = 1; __MODS__[modId].func(__MODS__[modId].req, m, m.exports); } return __MODS__[modId].m.exports; };
var __REQUIRE_WILDCARD__ = function(obj) { if(obj && obj.__esModule) { return obj; } else { var newObj = {}; if(obj != null) { for(var k in obj) { if (Object.prototype.hasOwnProperty.call(obj, k)) newObj[k] = obj[k]; } } newObj.default = obj; return newObj; } };
var __REQUIRE_DEFAULT__ = function(obj) { return obj && obj.__esModule ? obj.default : obj; };
__DEFINE__(1782991262853, function(require, module, exports) {

module.exports = inquire;

/**
 * Requires a module only if available.
 * @memberof util
 * @param {string} moduleName Module to require
 * @returns {?Object} Required module if available and not empty, otherwise `null`
 * @deprecated Legacy optional require helper. Will be removed in a future release.
 */
function inquire(moduleName) {
  try {
    if (typeof require !== "function") {
      return null;
    }
    var mod = require(moduleName);
    if (mod && (mod.length || Object.keys(mod).length)) return mod;
    return null;
  } catch (err) {
    // ignore
    return null;
  }
}

/*
// maybe worth a shot to prevent renaming issues:
// see: https://github.com/webpack/webpack/blob/master/lib/dependencies/CommonJsRequireDependencyParserPlugin.js
// triggers on:
// - expression require.cache
// - expression require (???)
// - call require
// - call require:commonjs:item
// - call require:commonjs:context

Object.defineProperty(Function.prototype, "__self", { get: function() { return this; } });
var r = require.__self;
delete Function.prototype.__self;
*/

}, function(modId) {var map = {}; return __REQUIRE__(map[modId], modId); })
return __REQUIRE__(1782991262853);
})()
//miniprogram-npm-outsideDeps=[]
//# sourceMappingURL=index.js.map