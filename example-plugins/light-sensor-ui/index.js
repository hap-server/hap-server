
const {default: hapserver, WebInterfacePlugin} = require('@hap-server/api');

const switch_ui = new WebInterfacePlugin();

switch_ui.loadScript('/ui.js');
switch_ui.static('/', __dirname);

hapserver.registerWebInterfacePlugin(switch_ui);
