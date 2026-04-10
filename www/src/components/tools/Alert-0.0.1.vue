<script>
import * as bootstrap from 'bootstrap';

export default {
    name: "Alert",
    template: ``,
    data() {
        return {
            data:{
                no: false,
                yes: false,
                message: "",
                no_class: 'btn-danger',
                yes_class: 'btn-success'
            },
            callback:false
        }
    },
    methods: {
        alert(title,message,callback=false,no="Close",yes="Save Changes",no_class=false,yes_class=false) {
            let that = this;
            that.data.title = title;
            that.callback = callback;
            that.data.no = no;
            that.data.yes = yes;
            that.data.message = message;

            if ( no_class ) {
                that.data.no_class = no_class;
            }

            if ( yes_class ) {
                that.data.yes_class = yes_class;
            }

            //$('#my_alert_modal').modal('toggle');
            this.modal.show();
        },
        alert_simple(title,message,no="Ok") {
            let that = this;
            that.data.title = title;
            that.data.message = message;
            that.data.no = no;
            that.data.yes = false;
            //$('#my_alert_modal').modal('toggle');
            this.modal.show();
        },
        callbackfunction() {
            //$('#my_alert_modal').modal('toggle');
            this.modal.hide();
            if (this.callback === false){
                return "done";
            } else {
                return this.callback();
            }
        },
        hide() {
            this.modal.hide();
        }
    },
    mounted: async function() {
        this.modal = new bootstrap.Modal('#my_alert_modal',{});
    },
};
</script>

<style scoped>
.btn {
    min-width: 5em;
}
</style>

<template>
    <div class="modal fade" id="my_alert_modal" tabindex="-1" role="dialog" aria-labelledby="myModalLabel">
        <div class="modal-dialog modal-lg" role="document">
            <div class="modal-content">
                <div class="modal-header">
                    <h4 class="modal-title" id="myModalLabel">{{data.title}}</h4>
                </div>
                <div class="modal-body">
                    <p><div v-for="(line,line_number) in data.message.split('\n')" >{{line}}</div></p>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn" :class="data.no_class" v-show="data.no" data-dismiss="modal" @click="hide()">{{data.no}}</button>
                    <button type="button" class="btn" :class="data.yes_class" v-show="data.yes" v-on:click="callbackfunction()">{{data.yes}}</button>
                </div>
            </div>
        </div>
    </div>
</template>