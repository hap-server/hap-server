<template>
    <div class="qrcode" v-html="svg"></div>
</template>

<script>
    import createqrcode from 'qrcode-generator';

    export default {
        props: {
            data: {type: String, default: ''},
        },
        computed: {
            qrcode() {
                const qrcode = createqrcode(0, 'M');

                qrcode.addData(this.data);
                qrcode.make();

                return qrcode;
            },
            svg() {
                return this.qrcode.createSvgTag({
                    cellSize: this.cellSize,
                    margin: this.margin,
                    scalable: true,
                });
            },
        },
    };
</script>
