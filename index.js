const Hapi = require('@hapi/hapi');
const Vision = require('@hapi/vision');
const Bell = require('@hapi/bell');
const handlebars = require('handlebars');
const {v4} = require('uuid');
const qs = require('query-string');

const PORT = 8080;
const CALLBACK = /oauth_callback="([^"]*)"/;

const tokens = {};

(async () => {
    const server = new Hapi.Server({port: PORT});
    server.ext('onPreResponse', onPreResponse);

    await server.register(Vision);
    server.views({engines: {html: handlebars}, relativeTo: __dirname});

    await server.register(Bell);
    server.auth.strategy('local', 'bell', {
        provider: {
            protocol: 'oauth',
            temporary: 'http://localhost:8080/request-token',
            token: 'http://localhost:8080/access-token',
            auth: '/authorize',
            async profile(credentials, oauthTokens) {
                credentials.profile = {
                    id: 'Authenticated User'
                };
            }
        },
        password: 'a-sufficiently-long-super-secret',
        clientId: 'client-id',
        clientSecret: 'client-secret',
        forceHttps: false,
        isSecure: false
    });

    server.route({
        method: 'GET',
        path: '/',
        handler: (request, h) => h.view('index.html')
    });

    server.route({
        method: 'GET',
        path: '/authenticated',
        options: {
            auth: 'local',
            handler: request => `👋 ${request.auth.credentials.profile.id}`
        }
    });


    server.route({
        method: 'POST',
        path: '/request-token',
        handler: (request, h) => {
            const token = v4();
            const callback = CALLBACK.exec(request.headers.authorization)[1];
            tokens[token] = {callback: decodeURIComponent(callback)};
            return h
                .response(`oauth_token=${token}`)
                .type('application/x-www-form-urlencoded');
        }
    });

    server.route({
        method: 'GET',
        path: '/authorize',
        handler: (request, h) => {
            const {oauth_token} = request.query;
            const {callback} = tokens[oauth_token];
            const query = {...request.query, oauth_verifier: v4()};

            return new Promise(resolve => {
                setTimeout(() => {
                    resolve(h.redirect(`${callback}?${qs.stringify(query)}`));
                }, Math.floor(Math.random() * 600 + 300));
            });
        }
    });

    server.route({
        method: 'POST',
        path: '/access-token',
        handler: (request, h) => {
            return h
                .response(`oauth_token=${v4()}&oauth_secret=${v4()}`)
                .type('application/x-www-form-urlencoded');
        }
    });

    await server.start();
    console.log('Server running at:', server.info.uri);
})();

function onPreResponse(request, h) {
    const statusCode =
        (request.response.output && request.response.output.statusCode) ||
        request.response.statusCode;

    console.log(
        '\n\n',
        request.method.toUpperCase(),
        request.url.pathname,
        JSON.stringify(request.query),
        statusCode,
        statusCode >= 400 ? request.response : ''
    );

    return h.continue;
}
