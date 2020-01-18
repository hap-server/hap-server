<!-- https://codepen.io/jmak/pen/LsCet -->

<template>
    <div class="icon icon-spinner spinner" :class="{'spinner-light': light}" :style="{
        'font-size': typeof size === 'number' ? size + 'px' : size,
    }">
        <div class="spinner-blade"></div>
        <div class="spinner-blade"></div>
        <div class="spinner-blade"></div>
        <div class="spinner-blade"></div>
        <div class="spinner-blade"></div>
        <div class="spinner-blade"></div>
        <div class="spinner-blade"></div>
        <div class="spinner-blade"></div>
        <div class="spinner-blade"></div>
        <div class="spinner-blade"></div>
        <div class="spinner-blade"></div>
        <div class="spinner-blade"></div>
    </div>
</template>

<script>
    export default {
        props: {
            light: Boolean,
            size: {
                default: null,
                validator(size) {
                    return typeof size === 'number' || typeof size === 'string';
                },
            },
        },
    };
</script>

<style lang="scss">
    $spinner-size: 48px !default;
    $spinner-colour: #69717d !default;
    $spinner-light-colour: #eeeeee !default;

    .spinner {
        font-size: $spinner-size;
        position: relative;
        display: inline-block;
        width: 1em;
        height: 1em;

        // &.center {
        //     position: absolute;
        //     left: 0;
        //     right: 0;
        //     top: 0;
        //     bottom: 0;
        //     margin: auto;
        // }

        .spinner-blade {
            position: absolute;
            left: .4629em;
            bottom: 0;
            width: .074em;
            height: .2777em;
            border-radius: .0555em;
            background-color: transparent;
            transform-origin: center -.2222em;
            animation: spinner-fade 1s infinite linear;

            $animation-delay: 0s;
            $blade-rotation: 0deg;

            @for $i from 1 through 12 {
                &:nth-child(#{$i}) {
                    animation-delay: $animation-delay;
                    transform: rotate($blade-rotation);
                    $blade-rotation: $blade-rotation + 30;
                    $animation-delay: $animation-delay + .083;
                }
            }
        }

        &.spinner-light .spinner-blade {
            animation-name: spinner-light-fade;
        }
    }

    @keyframes spinner-fade {
        0% {
            background-color: $spinner-colour;
        }
        100% {
            background-color: transparent;
        }
    }
    @keyframes spinner-light-fade {
        0% {
            background-color: $spinner-light-colour;
        }
        100% {
            background-color: transparent;
        }
    }
</style>
