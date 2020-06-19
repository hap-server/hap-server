import * as React from 'react';
import ReactiveComponent from '../reactive-component';
import {AppContext, LayoutContext} from '../context';
import {useWatcher} from '../util/reactivity-hooks';

import Layout, {LayoutSection} from '../../../client/layout';
import Service from '../../../client/service';

import {String, Number} from './Translation';

const NumberOfAccessories = Number.values('layout.x_of_x_accessories');

import {LayoutSectionComponents} from '../component-registry';

declare module '../../../client/layout' {
    interface Layout {
        staged_sections_order?: string[];
    }
}

export interface LayoutProps {
    layout: Layout | null;
}

export default class LayoutComponent extends ReactiveComponent<LayoutProps> {
    constructor(props: LayoutProps) {
        super(props);

        // require('./layout-sections');

        this.$watch(() => this.editing, edit => {
            if (edit && !Object.keys(this.sections!).length) this.addSection(0);
        });
        this.$watch(() => this.sections, sections => {
            if (this.editing && !Object.keys(sections!).length) this.addSection(0);
        });
    }

    static contextType = AppContext;
    context!: React.ContextType<typeof AppContext>;

    accessories = {};

    editing = false;
    readonly section_components = LayoutSectionComponents;

    updating_sections_order: Promise<void> | null = null;
    staged_sections_order: string[] | null = null;

    get layout() {
        return this.props.layout;
    }

    get sections() {
        return this.layout?.sections;
    }

    get can_edit() {
        return this.layout?.can_set ?? false;
    }

    get show_all_accessories() {
        return !this.layout;
    }

    get camera_accessories() {
        return [...Object.values(this.accessories)].filter(a =>
            // @ts-ignore
            a.display_services.find(s => s.collapsed_service_type === Service.CameraRTPStreamManagement))
            // @ts-ignore
            .map(a => a.uuid + '.CollapsedService.' + Service.CameraRTPStreamManagement);
    }

    get effective_sections() {
        if (this.show_all_accessories && !this.editing) return [this.all_accessories_section];

        return (this.staged_sections_order || this.sections_order).map(uuid => this.sections![uuid]);
    }
    set effective_sections(effective_sections) {
        this.sections_order = effective_sections.map(section => section.uuid);
    }

    get sections_order() {
        const sections_order = this.layout && this.layout.sections_order || [];

        return sections_order.concat(Object.values(this.sections || {})
            .filter(section => !sections_order.includes(section.uuid)).map(section => section.uuid));
    }
    set sections_order(sections_order) {
        if (!this.updating_sections_order) this.updating_sections_order = Promise.resolve();

        const updating_sections_order = this.updating_sections_order.then(() => {
            this.staged_sections_order = sections_order;
            // @ts-ignore
            this.$set(this.layout!, 'staged_sections_order', sections_order);
            return this.layout!.updateData(Object.assign({}, this.layout!.data, {sections_order}));
        }).catch(() => null).then(() => {
            if (updating_sections_order !== this.updating_sections_order) return;
            this.updating_sections_order = null;
            this.staged_sections_order = null;
            // @ts-ignore
            this.$delete(this.layout!, 'staged_sections_order');
        });

        this.updating_sections_order = updating_sections_order;
    }

    get all_accessories_section() {
        return new LayoutSection(this.layout!, 'AllAccessories', {accessories: this.context!.getAllDisplayServices()});
    }

    get all_cameras_section() {
        return new LayoutSection(this.layout!, 'AllCameraAccessories', {accessories: this.camera_accessories});
    }

    get other_accessories() {
        return this.context!.getAllDisplayServices().filter(uuid => this.context!.getService(uuid) && !Object.values(this.sections!)
            .find(s => s.accessories && s.accessories.includes(uuid)));
    }

    get accessories_count() {
        if (!this.sections) return 0;

        const accessories = new Set();

        for (const section of Object.values(this.sections || {})) {
            if (!section.accessories) continue;

            for (const uuid of section.accessories) {
                const service = this.context!.getService(uuid);
                if (!service) continue;
                accessories.add(service.accessory);
            }
        }

        return accessories.size;
    }

    get total_accessories_count() {
        return Object.keys(this.accessories).length;
    }

    get layoutcontext(): LayoutContext | null {
        if (!this.layout) return null;

        return {
            ...this.context,

            layout: this.layout,
            can_edit: this.layout.can_set,
            editing: this.editing,
            addSection: this.addSection,
            removeSection: this.deleteSection,
        };
    }

    render() {
        return <LayoutContext.Provider value={this.layoutcontext}>
            <div className={'layout' + (this.editing ? ' layout-edit' : '')}>
                <h1>{this.layout?.name || <String name="layout.home" />}</h1>

                <div className="section">
                    <StatusMessages layout={this.layout} />
                </div>

                <div className="section">
                    {this.show_all_accessories || this.accessories_count === this.total_accessories_count ? <p>
                        <Number name="layout.x_accessories" value={this.total_accessories_count} />
                    </p> : <p>
                        <NumberOfAccessories value={this.total_accessories_count} available={this.accessories_count} />
                    </p>}
                </div>
            </div>
        </LayoutContext.Provider>;
    }

    addSection(index?: number, data?: any) {
        this.layout!.addSection(data, index);
    }

    deleteSection(section: LayoutSection) {
        this.layout!.deleteSection(section);
    }
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface StatusMessagesProps extends LayoutProps {}

export function StatusMessages(props: StatusMessagesProps) {
    const {getAllDisplayServices, getService} = React.useContext(AppContext)!;
    const defaultSections = useWatcher(() => {
        return [new LayoutSection(null!, 'AllAccessories', {accessories: getAllDisplayServices()})];
    });
    const sections = props.layout ? Object.values(props.layout.sections) :
        defaultSections;

    const status_messages = useWatcher(() => {
        return Object.entries(getStatusMessages(sections, getService));
    }, [sections, getService]);

    return <>
        {status_messages.map(([key, status_message]) =>
            <p key={key} className="mb-1">{status_message}</p>)}
    </>;
}

enum StatusMessageGroup {
    LIGHT = 'lights',
    TELEVISION = 'tv',
    OUTLET = 'outlets',
    SWITCH = 'switches',
}

function getStatusMessages(sections: LayoutSection[], getService: (uuid: string) => Service | null) {
    const status = getStatusValues(sections, getService);
    const status_messages: {
        [K in StatusMessageGroup]?: string;
    } = {};

    // Lights
    if (status.active_lights_count && status.active_light_rooms.length === 1 &&
        status.active_light_rooms[0] && !status.light_services.find(s => // eslint-disable-next-line @typescript-eslint/indent
            ((s.data.room_name || s.accessory.data.room_name) !== status.active_light_rooms[0] &&
                status.active_light_services.includes(s)) ||
            ((s.data.room_name || s.accessory.data.room_name) === status.active_light_rooms[0] &&
                !status.active_light_services.includes(s))) &&
        status.light_rooms.length !== 1
    ) {
        status_messages.lights = status.active_light_rooms[0] + ' light' +
            (status.active_lights_count === 1 ? '' : 's') + ' on.';
    } else if (status.active_lights_count && status.lights_count === status.active_lights_count) {
        status_messages.lights = `Light${status.active_lights_count === 1 ? '' : 's'} on.`;
    } else if (status.active_lights_count) {
        status_messages.lights = status.active_lights_count + ' light' +
            (status.active_lights_count === 1 ? '' : 's') + ' on.';
    }

    // TVs
    if (status.tv_on && status.active_tv_rooms.length === 1 &&
        status.active_tv_rooms[0] && !status.tv_services.find(s => // eslint-disable-next-line @typescript-eslint/indent
            ((s.data.room_name || s.accessory.data.room_name) !== status.active_tv_rooms[0] &&
                status.active_tv_services.includes(s)) ||
            ((s.data.room_name || s.accessory.data.room_name) === status.active_tv_rooms[0] &&
                !status.active_tv_services.includes(s)))
    ) {
        status_messages.tv = `${status.active_tv_rooms[0]} TV on.`;
    } else if (status.tv_on) status_messages.tv = `TV on.`;

    // Outlets/power points
    if (status.active_outlets_count && status.active_outlet_rooms.length === 1 &&
        status.active_outlet_rooms[0] && !status.outlet_services.find(s => // eslint-disable-next-line @typescript-eslint/indent
            ((s.data.room_name || s.accessory.data.room_name) !== status.active_outlet_rooms[0] &&
                status.active_outlet_services.includes(s)) ||
            ((s.data.room_name || s.accessory.data.room_name) === status.active_outlet_rooms[0] &&
                !status.active_outlet_services.includes(s))) &&
        status.outlet_rooms.length !== 1
    ) {
        status_messages.outlets = status.active_outlet_rooms[0] + ' power point' +
            (status.active_outlets_count === 1 ? '' : 's') + ' on.';
    } else if (status.active_outlets_count && status.outlets_count === status.active_outlets_count) {
        status_messages.outlets = `Power point${status.active_outlets_count === 1 ? '' : 's'} on.`;
    } else if (status.active_outlets_count) {
        status_messages.outlets = status.active_outlets_count + ' power point' +
            (status.active_outlets_count === 1 ? '' : 's') + ' on.';
    }

    // Switches
    if (status.active_switches_count && status.active_switch_rooms.length === 1 &&
        status.active_switch_rooms[0] && !status.switch_services.find(s => // eslint-disable-next-line @typescript-eslint/indent
            ((s.data.room_name || s.accessory.data.room_name) !== status.active_switch_rooms[0] &&
                status.active_switch_services.includes(s)) ||
            ((s.data.room_name || s.accessory.data.room_name) === status.active_switch_rooms[0] &&
                !status.active_switch_services.includes(s))) &&
        status.switch_rooms.length !== 1
    ) {
        status_messages.switches = status.active_switch_rooms[0] + ' switch' +
            (status.active_switches_count === 1 ? '' : 'es') + ' on.';
    } else if (status.active_switches_count && status.switches_count === status.active_switches_count) {
        status_messages.switches = `Switch${status.active_switches_count === 1 ? '' : 'es'} on.`;
    } else if (status.active_switches_count) {
        status_messages.switches = status.active_switches_count + ' switch' +
            (status.active_switches_count === 1 ? '' : 'es') + ' on.';
    }

    return status_messages;
}

function getStatusValues(sections: LayoutSection[], getService: (uuid: string) => Service | null) {
    const status = {
        light_services: [] as Service[], light_rooms: [] as (string | null)[], lights_count: 0,
        active_light_services: [] as Service[], active_light_rooms: [] as (string | null)[], active_lights_count: 0,
        tv_services: [] as Service[], tv_rooms: [] as (string | null)[],
        active_tv_services: [] as Service[], active_tv_rooms: [] as (string | null)[], tv_on: false,
        outlet_services: [] as Service[], outlet_rooms: [] as (string | null)[], outlets_count: 0,
        active_outlet_services: [] as Service[], active_outlet_rooms: [] as (string | null)[], active_outlets_count: 0,
        switch_services: [] as Service[], switch_rooms: [] as (string | null)[], switches_count: 0,
        active_switch_services: [] as Service[], active_switch_rooms: [] as (string | null)[], active_switches_count: 0,
    };

    for (const section of sections) {
        if (!section.accessories) continue;

        for (const uuid of section.accessories) {
            const service = getService(uuid);
            if (!service) continue;

            const room_name = service.data.room_name || service.accessory.data.room_name || null;

            // @ts-ignore
            if (service.type === Service.Lightbulb) {
                status.lights_count++;
                if (!status.light_services.includes(service)) status.light_services.push(service);
                if (!status.light_rooms.includes(room_name)) status.light_rooms.push(room_name);

                if (service.getCharacteristicValueByName('On')) {
                    status.active_lights_count++;
                    if (!status.active_light_services.includes(service)) status.active_light_services.push(service);
                    if (!status.active_light_rooms.includes(room_name)) status.active_light_rooms.push(room_name);
                }
            }

            // @ts-ignore
            if (service.type === 'CollapsedService.' + Service.Television) {
                if (!status.tv_services.includes(service)) status.tv_services.push(service);
                if (!status.tv_rooms.includes(room_name)) status.tv_rooms.push(room_name);

                if (service.getCharacteristicValueByName('Active')) {
                    status.tv_on = true;
                    if (!status.active_tv_services.includes(service)) status.active_tv_services.push(service);
                    if (!status.active_tv_rooms.includes(room_name)) status.active_tv_rooms.push(room_name);
                }
            }

            // @ts-ignore
            if (service.type === Service.Outlet) {
                status.outlets_count++;
                if (!status.outlet_services.includes(service)) status.outlet_services.push(service);
                if (!status.outlet_rooms.includes(room_name)) status.outlet_rooms.push(room_name);

                if (service.getCharacteristicValueByName('On')) {
                    status.active_outlets_count++;
                    if (!status.active_outlet_services.includes(service)) status.active_outlet_services.push(service);
                    if (!status.active_outlet_rooms.includes(room_name)) status.active_outlet_rooms.push(room_name);
                }
            }

            // @ts-ignore
            if (service.type === Service.Switch) {
                status.switches_count++;
                if (!status.switch_services.includes(service)) status.switch_services.push(service);
                if (!status.switch_rooms.includes(room_name)) status.switch_rooms.push(room_name);

                if (service.getCharacteristicValueByName('On')) {
                    status.active_switches_count++;
                    if (!status.active_switch_services.includes(service)) status.active_switch_services.push(service);
                    if (!status.active_switch_rooms.includes(room_name)) status.active_switch_rooms.push(room_name);
                }
            }
        }
    }

    return status;
}
