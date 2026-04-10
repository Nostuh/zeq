<script>
import axios from 'axios';
import { uf } from '../../../../utils/tools.mjs';

export default {    
    name: "Bullets",
    data() {
        return {
            bullets: []
        }
    },
    components: {
        
    },
    methods: {

    },
    mounted: async function() {
        while ( this.bullets.length == 0 ) {
            this.bullets = this.$parent.$parent.bullets;
            await uf.sleep(100);
        }
    }
}
</script>


<template>
    <div class="row">
        <table class="table table-bordered table-striped table-condensed">
            <tbody>
                <tr v-for="(v) in bullets" :key="v.id">
                    <th>{{v.name}}</th>
                    <td>{{v.display_order}}</td>
                </tr>
            </tbody>
        </table>
    </div>   
</template>