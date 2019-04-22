
import hapserver, {AccessoryUI} from 'hap-server-api';

const switch_ui = new AccessoryUI();

switch_ui.loadScript('/ui.js');
switch_ui.static('/', __dirname);

hapserver.registerAccessoryUI(switch_ui);
