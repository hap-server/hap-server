import * as React from 'react';

import {NativeHook} from '../native-hook';
import Modals from '../modals';
import {Client, Accessory, Service, Layout, LayoutSection, Automation} from '../../client';
import VueI18n from 'vue-i18n';

export type TranslationContext = VueI18n;
export const TranslationContext = React.createContext<TranslationContext | null>(null);

export interface AppContext {
    native_hook: NativeHook | null;
    modals: Modals;
    client: Client;
    getAssetURL: (asset: string) => string;
    errors: any;

    bridge_uuids: string[];
    getAllDisplayServices: () => string[];
    getService: (uuid: string, service_uuid?: string) => Service | null;
}
export const AppContext = React.createContext<AppContext | null>(null);

export interface AccessoryContext extends Partial<AppContext> {
    accessory: Accessory;
}
export const AccessoryContext = React.createContext<AccessoryContext | null>(null);

export interface ServiceContext extends Partial<AppContext> {
    service: Service;
}
export const ServiceContext = React.createContext<ServiceContext | null>(null);

export interface LayoutContext extends Partial<AppContext> {
    layout: Layout;

    can_edit: boolean;
    editing: boolean;
    addSection: (index?: number) => void;
    removeSection: (section: LayoutSection) => void;
}
export const LayoutContext = React.createContext<LayoutContext | null>(null);

export interface LayoutSectionContext extends Partial<AppContext> {
    section: LayoutSection;

    can_edit: boolean;
    editing: boolean;
}
export const LayoutSectionContext = React.createContext<LayoutSectionContext | null>(null);

export interface AutomationContext extends Partial<AppContext> {
    automation: Automation;
}
export const AutomationContext = React.createContext<AutomationContext | null>(null);
