const Bundler = require("parcel-bundler");
const fs = require("fs-extra");
const path = require("path");

class ServerlessPluginParcel {
  constructor(serverless, options) {
    this.serverlessFolder = ".serverless";
    this.buildFolder = ".serverless_parcel";
    this.servicePath = serverless.config.servicePath;
    this.buildPath = path.join(this.servicePath, this.buildFolder);

    this.serverless = serverless;
    this.options = options;

    this.hooks = {
      "before:package:createDeploymentArtifacts": this.bundle.bind(this),
      "after:package:createDeploymentArtifacts": this.cleanup.bind(this),
      "before:deploy:function:packageFunction": this.bundle.bind(this),
      "after:deploy:function:packageFunction": this.cleanup.bind(this)
    };
  }

  bundle() {
    this.serverless.cli.log("bundling parcel entries...");

    const { functions, custom } = this.serverless.service;
    const { entries, options } = custom.parcel;

    // bundle custom entries
    const customBundles = entries.map(entry => {
      const bundler = new Bundler(entry.file, entry);
      return bundler.bundle();
    });

    // bundle lambda entries
    const lambdaBundles = Object.keys(functions).map(key => {
      const { handler } = functions[key];
      const method = path.extname(handler);
      const entry = handler.replace(method, ".[jt]s");

      // determine output locations
      const outPath = path.join(this.buildPath, path.dirname(entry));
      const outDir = path.relative(this.servicePath, outPath);

      // build parcel config
      const defaults = { target: "node" };
      const config = Object.assign({}, defaults, options, { outDir });

      const bundler = new Bundler(`./${entry}`, config);
      return bundler.bundle();
    });

    // point serverless to the build path to zip files
    this.serverless.config.servicePath = this.buildPath;
    return Promise.all(lambdaBundles.concat(customBundles));
  }

  cleanup() {
    this.serverless.cli.log("cleaning up parcel bundles");
    const serverlessBuildPath = path.join(this.servicePath, this.serverlessFolder);
    const { functions } = this.serverless.service;

    // update the package artifacts
    Object.keys(functions).map(key => {
      const { artifact } = functions[key].package;
      const file = path.basename(artifact);
      const dest = path.join(serverlessBuildPath, file);

      // move the artifact to the serverless folder
      fs.moveSync(artifact, dest, { overwrite: true });
      this.serverless.service.functions[key].package.artifact = dest;
    });

    // set the service path back
    this.serverless.config.servicePath = this.servicePath;
    // remove the build folder
    fs.removeSync(this.buildPath);
  }
}

module.exports = ServerlessPluginParcel;
