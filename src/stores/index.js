// Registro das lojas. Para acrescentar uma loja nova, crie um arquivo nesta pasta com a mesma
// interface (id, name, automatic, isReady, search, affiliateLink, matchesUrl, productIdFromUrl) e inclua aqui.
const amazon = require('./amazon');
const mercadolivre = require('./mercadolivre');
const aliexpress = require('./aliexpress');
const shopee = require('./shopee');
const kabum = require('./kabum');
const magalu = require('./magalu');
const { shein, temu } = require('./manual');

const STORES = [mercadolivre, amazon, shopee, magalu, shein, aliexpress, kabum, temu];
const BY_ID = Object.fromEntries(STORES.map(s => [s.id, s]));

const getStore = id => BY_ID[id] || null;
const storeFromUrl = url => STORES.find(s => s.matchesUrl(url)) || null;

module.exports = { STORES, getStore, storeFromUrl };
