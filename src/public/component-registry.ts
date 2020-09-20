import {Connection} from '../client';
import {UserManagementHandler} from './plugins';
import {Component} from 'vue';

import ComponentRegistry from '../common/component-registry';
import {UIPlugin} from '../common/types/messages';
import {AccessoryStatus} from '../common/types/accessories';

export default ComponentRegistry;

export const ServiceTileComponents = new ComponentRegistry<UIPlugin, {
    component: Component;
    /**
     * Component to use for the service's icon when the service tile component isn't used (when it doesn't support
     * an accessory's status).
     */
    icon_component: Component | null;
    supported_statuses: AccessoryStatus[];
}>();
export const ServiceDetailsComponents = new ComponentRegistry<UIPlugin, Component>();
export const ServiceSettingsComponents = new ComponentRegistry<UIPlugin, Component>();
export const LayoutSectionComponents = new ComponentRegistry<UIPlugin, {
    component: Component;
    name: string;
}>();
export const AccessoryDiscoveryComponents = new ComponentRegistry<UIPlugin, {
    component: Component;
    setup_handler: number;
}>();
export const AccessorySetupComponents = new ComponentRegistry<UIPlugin, {
    component: Component;
    name: string;
    manual: boolean;
}>();
export const AccessoryConfigurationComponents = new ComponentRegistry<UIPlugin, Component>();
export const AccessoryPlatformConfigurationComponents = new ComponentRegistry<UIPlugin, Component>();
export const AuthenticationHandlerComponents = new ComponentRegistry<UIPlugin, {
    component: Component;
    name: string;
}>();
export const UserManagementHandlers = new ComponentRegistry<UIPlugin, {
    // eslint-disable-next-line func-call-spacing
    new (connection: Connection): UserManagementHandler;
}>();
export const AutomationTriggerComponents = new ComponentRegistry<UIPlugin, {
    component: Component;
    plugin: string | null;
    type: string;
    name: string;
}>();
export const AutomationConditionComponents = new ComponentRegistry<UIPlugin, {
    component: Component;
    plugin: string | null;
    type: string;
    name: string;
}>();
export const AutomationActionComponents = new ComponentRegistry<UIPlugin, {
    component: Component;
    plugin: string | null;
    type: string;
    name: string;
}>();

// @ts-ignore
global.components = {
    ServiceTileComponents,
    ServiceDetailsComponents,
    ServiceSettingsComponents,
    LayoutSectionComponents,
    AccessoryDiscoveryComponents,
    AccessorySetupComponents,
    AuthenticationHandlerComponents,
    UserManagementHandlers,
    AutomationTriggerComponents,
    AutomationConditionComponents,
    AutomationActionComponents,
};
