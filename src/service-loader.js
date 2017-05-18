/*
 * Copyright (C) 2017 Alasdair Mercer, !ninja
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

'use strict';

const debug = require('debug')('service-loader');
const forOwn = require('lodash.forown');
const pacscan = require('pacscan');
const path = require('path');
const whoIsThere = require('knockknock');

const version = require('../package.json').version;

/**
 * The regular expression used to check whether the string representation of a function indicates that it is in fact an
 * ECMAScript class.
 *
 * @private
 * @type {RegExp}
 */
const rClass = /^class\s+/;

/**
 * TODO: Document
 * TODO: Mention iterable nature
 * TODO: Mention singleton nature
 *
 * @public
 */
class ServiceLoader {

  /**
   * Creates an instance of {@link ServiceLoader} for the service with the specified name belonging to the named package
   * and using the <code>options</code> provided.
   *
   * If <code>packageName</code> is not specified or is <code>null</code>, then the name of the package that called this
   * method will be used instead.
   *
   * Consumers can control what modules/packages are considered during the search for the calling package via the
   * <code>knockknock</code> option, however, the <code>limit</code> will always be overridden to <code>1</code>.
   *
   * @param {string} serviceName - the name of the service whose providers are to be loaded
   * @param {string} [packageName] - the name of the package for which the services are loaded (may be
   * <code>null</code>)
   * @param {ServiceLoader~Options} [options] - the options to be used (may be <code>null</code>)
   * @return {ServiceLoader} The {@link ServiceLoader} to be used to load providers for the named service.
   * @throws {Error} If <code>service</code> is not provided or if <code>packageName</code> is not provided and the
   * package name could not be resolved from the caller.
   * @public
   * @static
   */
  static load(serviceName, packageName, options) {
    return new ServiceLoader(serviceName, packageName, options);
  }

  /**
   * The current version of ServiceLoader.
   *
   * @public
   * @static
   * @type {string}
   */
  static get version() {
    return version;
  }

  /**
   * Finds the module that was responsible for calling {@link ServiceLoader} using <code>knockknock</code> and the
   * <code>options</code> provided.
   *
   * @param {?knockknock~Options} options - the options to be passed to <code>knockknock</code>
   * @return {?knockknock~Caller} The caller information for the module that was responsible calling
   * {@link ServiceLoader} (may be <code>null</code> if no caller could be found).
   * @private
   * @static
   */
  static _findCaller(options) {
    options = Object.assign({}, options, { limit: 1 });

    const excludes = [ 'service-loader' ];

    options.excludes = options.excludes ? excludes.concat(options.excludes) : excludes;

    return whoIsThere.sync(options)[0];
  }

  /**
   * Returns whether the specified object is an ECMAScript class.
   *
   * @param {*} obj - the object to be checked (may be <code>null</code>)
   * @return {boolean} <code>true</code> if <code>obj</code> is a class; otherwise <code>false</code>.
   * @private
   * @static
   */
  static _isClass(obj) {
    return typeof obj === 'function' && rClass.test(obj.toString());
  }

  /**
   * Parses the optional input <code>options</code> provided, normalizing options and applying default values, where
   * needed.
   *
   * @param {?ServiceLoader~Options} options - the input options to be parsed (may be <code>null</code> if none were
   * provided)
   * @returns {ServiceLoader~Options} A new options object parsed from <code>options</code>.
   * @private
   * @static
   */
  static _parseOptions(options) {
    if (!options) {
      options = {};
    }

    return { knockknock: options.knockknock };
  }

  /**
   * Creates an instance of {@link ServiceLoader} for the service with the specified name belonging to the named package
   * and using the <code>options</code> provided.
   *
   * If <code>packageName</code> is not specified or is <code>null</code>, then the name of the package that called this
   * constructor will be used instead.
   *
   * Consumers can control what modules/packages are considered during the search for the calling package via the
   * <code>knockknock</code> option, however, the <code>limit</code> will always be overridden to <code>1</code>.
   *
   * @param {string} serviceName - the name of the service whose providers are to be loaded
   * @param {string} [packageName] - the name of the package for which the services are loaded (may be
   * <code>null</code>)
   * @param {ServiceLoader~Options} [options] - the options to be used (may be <code>null</code>)
   * @throws {Error} If <code>service</code> is not provided or if <code>packageName</code> is not provided and the
   * package name could not be resolved from the caller.
   * @public
   */
  constructor(serviceName, packageName, options) {
    if (!options && typeof packageName === 'object') {
      options = packageName;
      packageName = null;
    }

    options = ServiceLoader._parseOptions(options);

    if (!packageName) {
      const caller = ServiceLoader._findCaller(options.knockknock);
      packageName = caller != null && caller.pkg != null ? caller.pkg.name : null;
    }

    if (!serviceName) {
      throw new Error('serviceName must be specified');
    }
    if (!packageName) {
      throw new Error('packageName must be specified as cannot resolve calling package');
    }

    /**
     * The name of the service whose providers are to be loaded by this {@link ServiceLoader}.
     *
     * @private
     * @type {string}
     */
    this._serviceName = serviceName;

    /**
     * The name of the package whose named service the providers are to be loaded by this {@link ServiceLoader}.
     *
     * @private
     * @type {string}
     */
    this._packageName = packageName;

    /**
     * The parsed options for this {@link ServiceLoader}.
     *
     * @private
     * @type {ServiceLoader~Options}
     */
    this._options = options;

    /**
     * The file paths of loaded providers mapped to their corresponding loaded provider.
     *
     * This map is only assigned and populated the first time that this {@link ServiceLoader} is iterated over and is
     * held as a cache to speed up future iterations over this {@link ServiceLoader} and to maintain the singleton
     * nature of service providers.
     *
     * That said; this map can be cleared at any time by calling {@link #reload}.
     *
     * @private
     * @type {?Map.<string, *>}
     */
    this._providers = null;

    debug('Loaded ServiceLoader for "%s" service in "%s" package', serviceName, packageName);
  }

  /**
   * @override
   */
  *[Symbol.iterator]() {
    if (!this._providers) {
      const packages = pacscan.sync({
        includeParents: true,
        knockknock: this._options.knockknock,
        path: __filename
      });
      const providers = new Map();

      packages.forEach((pkg) => this._loadPackage(pkg, providers));

      this._providers = providers;
    }

    yield* this._providers.values();
  }

  /**
   * Clears any service providers that have been previously loaded by this {@link ServiceLoader}.
   *
   * @return {void}
   * @public
   */
  reload() {
    this._providers = null;
  }

  /**
   * @override
   */
  toString() {
    return `ServiceLoader[${this._serviceName}]`;
  }

  /**
   * Loads the <code>package.json</code> file for the package provided and then loads any matching service providers
   * into <code>providers</code>.
   *
   * All services that are <b>not</b> associated with the service and package names of this {@link ServiceLoader} will
   * be ignored.
   *
   * @param {pacscan~Package} pkg - the package whose service providers, if any, are to be loaded
   * @param {Map.<string, *>} providers - the map of service providers to which any matching providers are to be added
   * @return {void}
   * @private
   */
  _loadPackage(pkg, providers) {
    debug('Attempting to load package "%s"', pkg.name);

    const packageJson = require(path.join(pkg.directory, 'package.json'));

    forOwn(packageJson.services, (services, servicePackageName) => {
      if (servicePackageName === this._packageName) {
        this._loadServiceProviders(pkg, services, providers);
      }
    });
  }

  /**
   * Loads the service provider at the specified <code>filePath</code>.
   *
   * Generally, this method simply <code>require</code>s the file, however, it does some special handling depending on
   * the type of service provider exported. Currently, this special handling only extends to ECMAScript classes, where
   * an instance is created and returned instead.
   *
   * @param {string} filePath - the path of the service provider file to be loaded
   * @return {*} The result of loading the service provider.
   * @private
   */
  _loadProvider(filePath) {
    debug('Loading "%s" provider for "%s" service in "%s" package', filePath, this._serviceName, this._packageName);

    const provider = require(filePath);
    if (ServiceLoader._isClass(provider)) {
      const ProviderConstructor = provider;
      return new ProviderConstructor();
    }

    return provider;
  }

  /**
   * Loads any matching service providers referenced in the specified <code>services</code> into <code>providers</code>.
   *
   * How the service providers are loaded depends on the type provided (e.g. ECMAScript classes are instantiated), and
   * the result is cached within the specified <code>loader</code> to avoid subsequent provider loads for the same
   * <code>loader</code>. This cache can be cleared by calling {@link ServiceLoader#reload} on <code>loader</code>.
   *
   * All services that are <b>not</b> associated with the service name for this {@link ServiceLoader} will be ignored.
   *
   * @param {pacscan~Package} pkg - the package to which <code>services</code> belongs
   * @param {?ServiceLoader~Services} services - the services containing the providers to be loaded (may be
   * <code>null</code> if none exist for the package)
   * @param {Map.<string, *>} providers - the map of service providers to which any matching providers are to be added
   * @return {void}
   * @private
   */
  _loadServiceProviders(pkg, services, providers) {
    forOwn(services, (service, serviceName) => {
      service = typeof service === 'string' ? { path: service } : service;

      if (serviceName === this._serviceName && service && service.path) {
        const providerPath = path.resolve(pkg.directory, service.path);

        if (!providers.has(providerPath)) {
          providers.set(providerPath, this._loadProvider(providerPath));
        }
      }
    });
  }

}

module.exports = ServiceLoader;

/**
 * The options to be used to load service providers.
 *
 * @typedef {Object} ServiceLoader~Options
 * @property {knockknock~Options} [knockknock] - The options to be passed to <code>knockknock</code> when attempting to
 * determine the calling module (<code>limit</code> will always be overridden to <code>1</code>).
 */

/**
 * Contains information for an individual package extracted from its <code>package.json</code> file.
 *
 * @typedef {Object} ServiceLoader~Package
 * @property {string} name - The name of the package.
 * @property {?Object.<string, ServiceLoader~Services>} services - The services for the package.
 */

/**
 * Contains information for an individual service provider.
 *
 * @typedef {Object} ServiceLoader~Service
 * @property {string} path - The file path to the service provider relative to its package's installation directory.
 */

/**
 * Contains information for all service providers available within an individual package.
 *
 * @typedef {Object.<string, ServiceLoader~Service|string>} ServiceLoader~Services
 */
