import { isFunction, isObject, param } from '../utils';
import RequestError from './error';

export const REQUEST_METHODS = [
  'GET',
  'POST',
  'HEAD',
  'DELETE',
  'OPTIONS',
  'PUT',
  'PATCH'
];

export default class Request {
  /**
   * default options
   */
  defaultOptions = {
    method: 'POST', // default
    mode: 'cors',
    cache: 'no-cache',
    credentials: 'include',
    headers: {
      'content-type': 'application/json'
    },
    responseType: 'json', // text or blob or formData https://fetch.spec.whatwg.org/
    prefix: '', // request prefix
    beforeRequest: null, // before request check, return false or a rejected Promise will stop request
    parseResponse: null, // custom parse function, need return response of processing
    afterResponse: null, // after request hook
    errorHandle: null, // global error handle
    withHeaders: null, // function & object, every request will take it
    timeout: null // request timeout
  };

  constructor(opts = {}) {
    this._options = {
      ...this.defaultOptions,
      ...opts
    };

    // normalize the headers
    const headers = this._options.headers;

    for (const h in headers) {
      if (h !== h.toLowerCase()) {
        headers[h.toLowerCase()] = headers[h];
        delete headers[h];
      }
    }

    REQUEST_METHODS.forEach(method => {
      this[method.toLowerCase()] = (url, data, options = {}) => {
        options.data = data;
        return this.send(url, { ...options, method });
      };
    });
  }

  create = opts => {
    return new Request(opts);
  };

  /**
   * Set Options
   *
   * Examples:
   *
   *   .config('method', 'GET')
   *   .config({headers: {'content-type': 'application/json'}})
   *
   * @param {String|Object} key
   * @param {Any} value
   * @return {Request}
   */
  config = (key, value) => {
    const options = this._options;

    if (typeof key === 'object') {
      for (const k in key) {
        options[k] = key[k];
      }
    } else {
      options[key] = value;
    }

    return this;
  };

  prefix = prefix => {
    if (prefix && typeof prefix === 'string') this._options.prefix = prefix;
    return this;
  };

  timeout = timeout => {
    if (timeout && typeof timeout === 'number') this._options.timeout = timeout;
    return this;
  };

  beforeRequest = cb => {
    const options = this._options;
    if (isFunction(cb)) {
      options.beforeRequest = cb;
    }
    return this;
  };

  afterResponse = cb => {
    const options = this._options;
    if (isFunction(cb)) {
      options.afterResponse = cb;
    }
    return this;
  };

  errorHandle = cb => {
    const options = this._options;
    if (isFunction(cb)) {
      options.errorHandle = cb;
    }
    return this;
  };

  withHeaders = cb => {
    const options = this._options;
    if (isFunction(cb)) {
      options.withHeaders = cb;
    }
    return this;
  };

  parseResponse = cb => {
    const options = this._options;
    if (isFunction(cb)) {
      options.parseResponse = cb;
    }
    return this;
  };

  /**
   * Set headers
   *
   * Examples:
   *
   *   .headers('Accept', 'application/json')
   *   .headers({ Accept: 'application/json' })
   *
   * @param {String|Object} key
   * @param {String} value
   * @return {Request}
   */
  headers = (key, value) => {
    const { headers } = this._options;

    if (isObject(key)) {
      for (const k in key) {
        headers[k.toLowerCase()] = key[k];
      }
    } else if (isFunction(key)) {
      headers.__headersFun__ = key;
    } else {
      headers[key.toLowerCase()] = value;
    }

    return this;
  };

  /**
   * Set Content-Type
   *
   * @param {String} type
   */
  contentType = type => {
    const { headers } = this._options;

    switch (type) {
      case 'json':
        type = 'application/json';
        break;
      case 'form':
      case 'urlencoded':
        type = 'application/x-www-form-urlencoded;charset=UTF-8';
        break;
      case 'multipart':
        type = 'multipart/form-data';
        break;
    }

    headers['content-type'] = type;
    return this;
  };

  /**
   * GET send form
   */
  getform = (url, data, opts = {}) => {
    opts.data = data;
    return this.send(url, {
      ...opts,
      method: 'GET',
      headers: {
        ...this._options.headers,
        ...opts.headers,
        'content-type': 'application/x-www-form-urlencoded;charset=UTF-8'
      }
    });
  };

  /**
   * POST send form
   */
  postform = (url, data, opts = {}) => {
    opts.data = data;
    return this.send(url, {
      ...opts,
      method: 'POST',
      headers: {
        ...this._options.headers,
        ...opts.headers,
        'content-type': 'application/x-www-form-urlencoded;charset=UTF-8'
      }
    });
  };

  // send request
  send = (url, opts = {}) =>
    new Promise((resolve, reject) => {
      if (typeof url !== 'string') {
        return reject(new RequestError('invalid url', 'invalidURL'));
      }

      const { data, ...otherOpts } = opts;

      const options = { ...this._options, ...otherOpts };

      const {
        beforeRequest,
        parseResponse,
        afterResponse,
        errorHandle,
        responseType,
        prefix,
        headers,
        withHeaders,
        timeout,
        ...fetchOpts
      } = options;

      /*******************
       * format header
       *******************/
      const { __headersFun__, ...realheaders } = headers;
      let newheaders = { ...realheaders };

      if (isFunction(withHeaders)) {
        const _newheaders = withHeaders();
        if (_newheaders && isObject(_newheaders)) {
          newheaders = { ...newheaders, ..._newheaders };
        }
      } else if (isObject(withHeaders)) {
        newheaders = { ...newheaders, ...withHeaders };
      }

      if (__headersFun__) {
        const _newheaders = __headersFun__();
        if (_newheaders && isObject(_newheaders)) {
          newheaders = { ...newheaders, ..._newheaders };
        }
      }

      fetchOpts.headers = newheaders;

      /***********************
       * format data to body
       ***********************/
      const contentType = newheaders['content-type'];
      fetchOpts.body = data;
      // if FormData
      if (
        contentType.indexOf('multipart/form-data') !== -1 ||
        data instanceof FormData
      ) {
        if (data instanceof FormData) {
          fetchOpts.body = data;
        } else if (isObject(data)) {
          fetchOpts.body = new FormData();
          for (const k in data) {
            fetchOpts.body.append(k, data[k]);
          }
        }
        // If it is FormData, content-type: 'multipart/form-data' is deleted,
        // otherwise the boundary will not be added automatically
        delete fetchOpts.headers['content-type'];
      }
      // if json
      else if (contentType.indexOf('application/json') !== -1) {
        fetchOpts.body = JSON.stringify(fetchOpts.body);
      }
      // if form
      else if (
        contentType.indexOf('application/x-www-form-urlencoded') !== -1
      ) {
        fetchOpts.body = param(fetchOpts.body);
      }

      // if 'GET' request, join _body of url queryString
      if (fetchOpts.method.toUpperCase() === 'GET' && data) {
        if (url.indexOf('?') >= 0) {
          url += '&' + param(data);
        } else {
          url += '?' + param(data);
        }
        delete fetchOpts.body;
      }

      /*******************
       * format url
       *******************/
      let nextURL = prefix + url;
      if (/^(http|https|ftp)\:\/\//.test(url)) {
        nextURL = url;
      }

      if (
        isFunction(beforeRequest) &&
        beforeRequest(nextURL, fetchOpts) === false
      ) {
        return reject(
          new RequestError(
            'request canceled by beforeRequest',
            'requestCanceled'
          )
        );
      }

      return this.__timeoutFetch(nextURL, fetchOpts, options)
        .then(resp => this.__checkStatus(resp))
        .then(resp => this.__parseResponse(resp, responseType, parseResponse))
        .then(resp => this.__afterResponse(resp, afterResponse, { prefix, url, ...fetchOpts }))
        .then(resp => resolve(resp))
        .catch(e => this.__errorHandle(e, errorHandle, reject, { prefix, url, ...fetchOpts }));
    });

  __checkStatus(response) {
    if (response.status >= 200 && response.status < 300) {
      if (response.status === 204) {
        return null;
      }
      return response;
    }
    const errortext = response.statusText;
    const error = new RequestError(errortext, response.status);
    error.response = response;
    throw error;
  }

  __parseResponse(response, responseType, parseResponse) {
    if (isFunction(parseResponse)) {
      const after = parseResponse(response, responseType);
      return after;
    }

    return isFunction(response && response[responseType])
      ? response[responseType]()
      : response;
  }

  __afterResponse(response, afterResponse, info) {
    if (isFunction(afterResponse)) {
      const after = afterResponse(response, info);
      return after;
    }

    return response;
  }

  __errorHandle(e, errorHandle, reject, info) {
    if (e.name !== 'RequestError') {
      e.name = 'RequestError';
      e.code = 0;
    }
    if (!isFunction(errorHandle) || errorHandle(e, info) !== false) {
      reject(e);
    }
  }

  __timeoutFetch(url, fetchOpts, options) {
    const timeout = options.timeout;
    if (timeout && typeof timeout === 'number') {
      return Promise.race([
        fetch(url, fetchOpts),
        new Promise((resolve, reject) =>
          setTimeout(
            () =>
              reject(
                new RequestError(`request timeout of ${timeout} ms.`, 'timeout')
              ),
            timeout
          )
        )
      ]);
    } else {
      return fetch(url, fetchOpts);
    }
  }
}
