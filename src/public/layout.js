import EventEmitter from 'events';

import Vue from 'vue';

export default class Layout extends EventEmitter {
    /**
     * Creates a Layout.
     *
     * @param {Connection} connection
     * @param {string} uuid
     * @param {object} data
     */
    constructor(connection, uuid, data) {
        super();

        this.connection = connection;
        this.uuid = uuid;
        this.sections = [];
        this._setData(data);
    }

    _setData(data) {
        this.data = data;

        this._updateSectionsFrom(data);
    }

    _updateSectionsFrom(data) {
        this.sections = data.sections || [];
    }

    async updateData(data) {
        await this.connection.setLayout(this.uuid, data);
        this._setData(data);
    }

    get name() {
        return this.data.name;
    }
}
