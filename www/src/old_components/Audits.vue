<script>

export default {    
    name: "Audits",
    data() {
        return {
            data: []
        }
    },
    components: {
        
    },
    methods: {

    },
    mounted: async function() {

    }
}
</script>


<template>
    <div>
        <h2>Audits</h2>
        <div class="container">
            <p><a href="./api/audits/main-images" target="_blank">Main Images</a></p>
            <p><a href="./api/audits/dimensions" target="_blank">Dimensions</a></p>
            <p><a href="./api/audits/dealer-skus" target="_blank">KI to Spruce SKU Mapping</a></p>
            <p><a href="./api/audits/dealer-attributes" target="_blank">Dealer Portal Needed Attributes</a></p>
        </div>
    </div>
</template>