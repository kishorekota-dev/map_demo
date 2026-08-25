module.exports = {
    root: true,
    env: {
        browser: true,
        node: true,
        es2022: true,
        jest: true
    },
    parserOptions: {
        ecmaVersion: 2022
    },
    globals: {
        ChatManager: 'readonly',
        io: 'readonly'
    },
    rules: {
        'no-undef': 'error',
        'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }]
    }
};
