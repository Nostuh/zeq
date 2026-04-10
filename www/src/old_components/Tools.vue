<script>

export default {    
    name: "Tools",
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
        <h2>Import Stuff</h2>
        <div class="container">
            <p><a href="./api/importtool/import/product_types" target="_blank">Import Product Types #1</a></p>
            <p><a href="./api/importtool/import/product_attributes" target="_blank">Import Attribute List #2</a></p>
            <p><a href="./api/importtool/import/products" target="_blank">Import Products #3</a></p>
        </div>
        <h2>Gets</h2>
        <div class="container">
            
            <p><a href="./api/importtool/import/update_product_images" target="_blank">Import Magento Images</a></p>
            <p><a href="./api/importtool/import/add_images" target="_blank">Add Images</a></p>
            <p><a href="./api/importtool/import/add_images_extra" target="_blank">Add Images Extra</a></p>
            <p><a href="./api/products/" target="_blank">Products List</a></p>
            <p><a href="./api/products/attribute_options" target="_blank">Product Type Attribute Options</a></p>
            <p><a href="./api/products/download_products" target="_blank">Product Download</a></p>
            <p><a href="./api/attributes/get-list" target="_blank">Get Attribute List</a></p>
            <p><a href="./api/laz/wtb_audit" target="_blank">WTB_AUDIT!</a></p>
            <p><a href="./api/laz/" target="_blank">LAZ!</a></p>

        </div>
    </div>
</template>