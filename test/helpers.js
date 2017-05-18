/*
 * Copyright (C) 2017 Alasdair Mercer, Skelp
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

'use strict'

const mkdirp = require('mkdirp')
const ncp = require('ncp').ncp
const path = require('path')
const tmp = require('tmp')

/**
 * The path to the temporary directory created from where fixtures should be run in isolation.
 *
 * This should only be accessed via {@link getTempDirectory} and will be <code>null</code> until that method is called
 * for the first time.
 *
 * @private
 * @type {?string}
 */
let tempDirPath

/**
 * Copies the contents of the fixture directory with the specified <code>name</code> to a temporary directory so that it
 * can be run in isolation.
 *
 * @param {string} name - the name of the fixture whose directory is to be copied
 * @return {Promise.<Error, string>} A <code>Promise</code> for retrieving the path to the temporary directory
 * containing the fixture contents.
 * @public
 * @static
 */
exports.copyFixture = function copyFixture(name) {
  return new Promise((resolve, reject) => {
    const dirPath = exports.getFixtureDirectory(name)

    mkdirp.sync(dirPath)

    ncp(path.join(__dirname, 'fixtures', name), dirPath, (error) => {
      if (error) {
        reject(error)
      } else {
        resolve(dirPath)
      }
    })
  })
}

/**
 * Creates options to be used by tests.
 *
 * This is just a convenient method for ensuring that chai and mocha calls are always excluded from knockknock when
 * trying to find the caller.
 *
 * @param {ServiceLoader~Options} [options] - the options to be used (may be <code>null</code>)
 * @return {ServiceLoader~Options} The created options.
 * @public
 * @static
 */
exports.createOptions = function createOptions(options) {
  if (!options) {
    options = {}
  }

  const knockknock = Object.assign({}, options.knockknock)
  knockknock.excludes = [ 'chai', 'mocha' ].concat(knockknock.excludes || [])

  options.knockknock = knockknock

  return options
}

/**
 * Returns the path to the temporary directory containing the contents of the fixture directory with the specified
 * <code>name</code>.
 *
 * @param {string} name - the name of the fixture whose temporary directory path is to be returned
 * @return {string} The temporary directory path for the fixture with <code>name</code>.
 * @public
 * @static
 */
exports.getFixtureDirectory = function getFixtureDirectory(name) {
  return path.join(exports.getTempDirectory(), 'fixtures', name)
}

/**
 * Returns the path of the temporary directory created from where fixtures should be run in isolation.
 *
 * @return {string} The temporary directory path.
 * @public
 * @static
 */
exports.getTempDirectory = function getTempDirectory() {
  if (tempDirPath == null) {
    tmp.setGracefulCleanup()

    tempDirPath = tmp.dirSync().name
  }

  return tempDirPath
}

/**
 * Requires the file at the given path within the directory for the fixture with the specified <code>name</code>.
 *
 * Since fixture directories are copied to a temporary directory to be run in isolation, they are no longer able to
 * easily find and require ServiceLoader by themselves. For this reason, this method returns a proxy to these fixtures
 * so that it can pass the absolute path to require ServiceLoader within the fixture while also ensuring that the
 * options are passed through {@link createOptions}.
 *
 * @param {string} name - the name of the fixture containing the file to be required
 * @param {string} filePath - the path of the file (relative to the fixture directory) to be required
 * @return {Function} A proxy to be used to call the fixture.
 * @public
 * @static
 */
exports.requireFromFixture = function requireFromFixture(name, filePath) {
  const fixture = require(exports.resolveFixtureFile(name, filePath))
  const serviceLoaderPath = path.resolve(__dirname, '../src/service-loader')

  return function proxy(serviceName, packageName, options) {
    if (!options && typeof packageName === 'object') {
      options = packageName
      packageName = null
    }

    return fixture(serviceLoaderPath, serviceName, packageName, exports.createOptions(options))
  }
}

/**
 * Resolves the specified <code>filePath</code> to the temporary directory for the fixture with the specified
 * <code>name</code>.
 *
 * @param {string} name - the name of the fixture to which <code>filePath</code> is to be resolved
 * @param {string} filePath - the path of the file to be resolved
 * @return {string} The resolve file path.
 * @public
 * @static
 */
exports.resolveFixtureFile = function resolveFixtureFile(name, filePath) {
  return path.resolve(exports.getFixtureDirectory(name), filePath)
}
