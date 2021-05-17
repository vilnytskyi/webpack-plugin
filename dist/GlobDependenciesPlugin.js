"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GlobDependenciesPlugin = void 0;
const BaseIncludePlugin_1 = require("./BaseIncludePlugin");
const minimatch_1 = require("minimatch");
const path = require("path");
const TAP_NAME = "Aurelia:GlobDependencies";
function* findFiles(root, glob, fs) {
    // An easiest, naive approach consist of listing all files and then pass them through minimatch.
    // This is a bad idea as `root` typically includes node_modules, which can contain *lots* of files.
    // So we have to test partial paths to prune them early on.
    const m = new minimatch_1.Minimatch(glob);
    const queue = [''];
    while (true) {
        let folder = queue.pop();
        if (folder === undefined)
            return;
        let full = path.resolve(root, folder);
        for (let name of fs.readdirSync(full)) {
            let stats = fs.statSync(path.resolve(full, name));
            if (stats.isDirectory()) {
                let subfolder = path.join(folder, name);
                if (m.match(subfolder, /*partial:*/ true))
                    queue.push(subfolder);
            }
            else if (stats.isFile()) {
                let file = path.join(folder, name);
                if (m.match(file))
                    yield file;
            }
        }
    }
}
class GlobDependenciesPlugin extends BaseIncludePlugin_1.BaseIncludePlugin {
    /**
     * Each hash member is a module name, for which globbed value(s) will be added as dependencies
     **/
    constructor(hash) {
        super();
        this.root = path.resolve();
        for (let module in hash) {
            let glob = hash[module];
            if (!Array.isArray(glob))
                hash[module] = [glob];
        }
        this.hash = hash;
    }
    apply(compiler) {
        const hashKeys = Object.getOwnPropertyNames(this.hash);
        if (hashKeys.length === 0)
            return;
        compiler.hooks.beforeCompile.tapPromise(TAP_NAME, () => {
            // Map the modules passed in ctor to actual resources (files) so that we can
            // recognize them no matter what the rawRequest was (loaders, relative paths, etc.)
            this.modules = {};
            const resolver = compiler.resolverFactory.get("normal", {});
            return Promise.all(hashKeys.map(module => new Promise(resolve => {
                resolver.resolve({}, this.root, module, {}, (err, resource) => {
                    if (err) {
                        resolve(undefined);
                        return;
                    }
                    this.modules[resource] = this.hash[module];
                    resolve(undefined);
                });
            })))
                .then(() => { });
        });
        super.apply(compiler);
    }
    parser(compilation, parser, addDependency) {
        const resolveFolders = compilation.options.resolve.modules;
        // `resolveFolders` can be absolute paths, but by definition this plugin only 
        // looks for files in subfolders of the current `root` path.
        const normalizers = resolveFolders.map(x => path.relative(this.root, x))
            .filter(x => !x.startsWith(".."))
            .map(x => new RegExp("^" + x + "/", "ig"));
        parser.hooks.program.tap(TAP_NAME, () => {
            const globs = this.modules[parser.state.module.resource];
            if (!globs)
                return;
            for (let glob of globs)
                for (let file of findFiles(this.root, glob, compilation.inputFileSystem)) {
                    file = file.replace(/\\/g, "/");
                    // todo: uncomment this
                    // normalizers.forEach(x => file = file.replace(x, ""));
                    addDependency(file);
                }
        });
    }
}
exports.GlobDependenciesPlugin = GlobDependenciesPlugin;
;
