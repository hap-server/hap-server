<template>
    <div v-if="!si" class="server-status">
        <p>{{ $t('server_status.loading') }}</p>
    </div>

    <div v-else class="server-status">
        <dl class="row">
            <dt class="col-5">{{ $t('server_status.system_uptime') }}</dt>
            <dd class="col-7 text-right selectable">
                {{ getHumanReadableTime(si.time.uptime * 1000) }}
            </dd>
            <dt class="col-5">{{ $t('server_status.hapserver_uptime') }}</dt>
            <dd class="col-7 text-right selectable">
                {{ getHumanReadableTime(si.uptime) }}
            </dd>
        </dl>

        <hr />

        <dl class="row">
            <dt class="col-5">{{ $t('server_status.system_model') }}</dt>
            <dd class="col-7 text-right selectable">
                {{ si.system.model }}
            </dd>

            <dt class="col-5">{{ $t('server_status.os') }}</dt>
            <dd class="col-7 text-right selectable">
                {{ si.os.codename }}
            </dd>

            <dt class="col-5">{{ $t('server_status.os_version') }}</dt>
            <dd class="col-7 text-right selectable">
                {{ si.os.release }} ({{ si.os.build }})
            </dd>

            <dt class="col-5">{{ $t('server_status.hapserver_version') }}</dt>
            <dd class="col-7 text-right selectable">
                {{ si.versions['hap-server'] }}
                <template v-if="si.updates['hap-server']">
                    ({{ $t('server_status.update_to', {v: si.updates['hap-server']}) }})
                </template>
            </dd>
            <dt class="col-5">{{ $t('server_status.homebridge_version') }}</dt>
            <dd class="col-7 text-right selectable">
                {{ si.versions.homebridge }}
                <template v-if="si.updates.homebridge">({{ $t('server_status.update_available') }})</template>
                <template v-if="si.versions.homebridgeApi">
                    <br />
                    API {{ si.versions.homebridgeApi }}
                </template>
            </dd>
            <dt class="col-5">{{ $t('server_status.hapnodejs_version') }}</dt>
            <dd class="col-7 text-right selectable">
                {{ si.versions['hap-nodejs'] }}
                <template v-if="si.updates['hap-nodejs']">({{ $t('server_status.update_available') }})</template>
            </dd>
            <dt class="col-5">{{ $t('server_status.nodejs_version') }}</dt>
            <dd class="col-7 text-right selectable">
                {{ si.versions.nodejs }}
                <template v-if="si.updates.nodejs">
                    ({{ $t('server_status.update_to', {v: si.updates.nodejs}) }})
                </template>
                <br />v8 {{ si.versions.v8 }}
                <br />Native modules {{ si.versions.modules }}
            </dd>
            <dt v-if="si.versions.npm" class="col-5">{{ $t('server_status.npm_version') }}</dt>
            <dd v-if="si.versions.npm" class="col-7 text-right selectable">
                {{ si.versions.npm }}
                <template v-if="si.updates.npm">({{ $t('server_status.update_to', {v: si.updates.npm}) }})</template>
            </dd>
        </dl>

        <hr />

        <dl class="row">
            <dt class="col-sm-5">{{ $t('server_status.hostname') }}</dt>
            <dd class="col-sm-7 text-right selectable">
                {{ si.os.hostname }}
            </dd>

            <!-- eslint-disable-next-line vue/no-use-v-if-with-v-for -->
            <template v-for="(ni, index) in si.network" v-if="ni.info.operstate === 'up' && !ni.info.internal && ni.ip_addresses.length">
                <dt v-if="si.network.length === 1" :key="'networkinterface-' + index + '-key'" class="col-12">
                    {{ $tc('server_status.ip_addresses', ni.ip_addresses.length) }}
                </dt>
                <dt v-else :key="'networkinterface-' + index + '-key'" class="col-12">
                    {{ $tc('server_status.network_interface_x_ip_addresses', ni.ip_addresses.length, {name: ni.display_name}) }}
                </dt>
                <dd :key="'networkinterface-' + index + '-value'" class="col-12 text-right selectable"
                    :title="$t('server_status.network_interface_info', ni.info)"
                >
                    <template v-for="(address, index) in ni.ip_addresses.filter(a => a.family === 'IPv6')">
                        <br v-if="index !== 0" :key="index" />
                        <template v-if="address.address.match(/^fe80:(:|(:[0-9a-f]{1,4}){1,4})/i)">
                            {{ address.address }}%{{ ni.name }}
                        </template>
                        <template v-else-if="address.family === 'IPv6'">{{ address.address }}</template>
                    </template>
                </dd>
            </template>
        </dl>

        <hr />

        <dl class="row">
            <dt class="col-5">{{ $t('server_status.memory_usage') }}</dt>
            <dd class="col-7 text-right selectable" :title="$t('server_status.memory_usage_info', {
                free: getHumanReadableSize(si.memory.free, 1024),
                used: getHumanReadableSize(si.memory.used, 1024),
                active: getHumanReadableSize(si.memory.active, 1024),
                available: getHumanReadableSize(si.memory.available, 1024),
                buffers_cached: getHumanReadableSize(si.memory.buffcache, 1024),
                swaptotal: getHumanReadableSize(si.memory.swaptotal, 1024),
                swapused: getHumanReadableSize(si.memory.swapused, 1024),
                swapfree: getHumanReadableSize(si.memory.swapfree, 1024),
            })">
                {{ getHumanReadableSize(si.memory.active, 1024) }} /
                {{ getHumanReadableSize(si.memory.total, 1024) }}
            </dd>

            <template v-for="(fs, index) in si.fs">
                <dt :key="'fs-' + index + '-key'" class="col-5">{{ getVolumeName(fs) }}</dt>
                <dd :key="'fs-' + index + '-value'" class="col-7 text-right selectable"
                    :title="$t('server_status.filesystem_info', fs)"
                >
                    {{ getHumanReadableSize(fs.used) }} / {{ getHumanReadableSize(fs.size) }}
                </dd>
            </template>

            <template v-for="(battery, index) in si.batteries">
                <dt v-if="si.batteries.length === 1" :key="'battery-' + index + '-key'" class="col-5">
                    {{ $t('server_status.battery') }}
                </dt>
                <dt v-else :key="'battery-' + index + '-key'" class="col-5">
                    {{ $t('server_status.battery_x', {x: index + 1}) }}
                </dt>
                <dd :key="'battery-' + index + '-value'" class="col-7 text-right selectable"
                    :title="$t('server_status.battery_info', battery)"
                >
                    {{ battery.percent }}%
                    <template v-if="battery.ischarging">({{ $t('server_status.battery_charging') }})</template>
                    <template v-else-if="battery.acconnected">({{ $t('server_status.battery_powered') }})</template>
                </dd>
            </template>
        </dl>
    </div>
</template>

<script>
    import {ClientSymbol, GetAssetURLSymbol} from '../../internal-symbols';

    export default {
        inject: {
            client: {from: ClientSymbol},
        },
        computed: {
            si() {
                return this.client.system_information;
            },
        },
        created() {
            this.client.loadSystemInformation(this);
        },
        destroyed() {
            this.client.unloadSystemInformation(this);
        },
        methods: {
            getHumanReadableTime(time) {
                const MINUTE = 1000 * 60;
                const HOUR = MINUTE * 60;
                const DAY = HOUR * 24;

                let ret = '';
                let remaining = time;

                if (remaining >= DAY) {
                    ret += (ret ? ' ' : '') + this.$tc('server_status.days', Math.floor(remaining / DAY));
                    remaining -= Math.floor(remaining / DAY) * DAY;
                }
                if (remaining >= HOUR) {
                    ret += (ret ? ' ' : '') + this.$tc('server_status.hours', Math.floor(remaining / HOUR));
                    remaining -= Math.floor(remaining / HOUR) * HOUR;
                }
                if (remaining >= MINUTE) {
                    ret += (ret ? ' ' : '') + this.$tc('server_status.minutes', Math.floor(remaining / MINUTE));
                    remaining -= Math.floor(remaining / MINUTE) * MINUTE;
                }

                if (time < MINUTE) return this.$tc('server_status.seconds', Math.floor(remaining / 1000));
                return ret;
            },
            getVolumeName(fs) {
                if (fs.mount === '/') return this.$t('server_status.filesystem_root');

                if (this.si.os.platform === 'darwin') {
                    if (fs.mount === '/System/Volumes/Data') return this.$t('server_status.filesystem_data');
                    if (fs.mount === '/private/var/vm') return this.$t('server_status.filesystem_swap');
                    if (fs.fs.startsWith('/dev/disk')) return this.$t('server_status.filesystem_x', {name: fs.fs.substr(5)});
                }

                return this.$t('server_status.filesystem_x', {name: fs.fs});
            },
            getHumanReadableSize(size, b = 1000) {
                if (size < b) return this.$t('server_status.size_in_bytes', {x: size});
                if (size < b ** 2) return this.getHumanReadableSize2(size, b === 1024 ? 'kib' : 'kb', b, 1);
                if (size < b ** 3) return this.getHumanReadableSize2(size, 'mb', b, 2);
                if (size < b ** 4) return this.getHumanReadableSize2(size, 'gb', b, 3);
                if (size < b ** 5) return this.getHumanReadableSize2(size, 'tb', b, 4);
                if (size < b ** 6) return this.getHumanReadableSize2(size, 'eb', b, 5);
                if (size < b ** 7) return this.getHumanReadableSize2(size, 'zb', b, 6);
                return this.getHumanReadableSize2(size, 'yb', b, 7);
            },
            getHumanReadableSize2(size, t, b, p) {
                return this.$t('server_status.size_in_' + t, {
                    x: Math.round((size / b ** p) * 100) / 100,
                });
            },
        },
    };
</script>
