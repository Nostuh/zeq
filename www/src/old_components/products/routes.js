import Products from './Products.vue';
import ProductsList from './ProductsList.vue';


import Product from './Product.vue';
import ProductAdd from './ProductAdd.vue';

import Product_Product from './product/Product.vue';
import Product_Product_Type_Edit from './product/EditProductType.vue';
import Product_Attributes from './product/Attributes.vue';
import Product_Images from './product/Images.vue';
import Product_Bullets from './product/Bullets.vue';
import Product_Ecom from './product/Ecom.vue';
import Product_Videos from './product/Videos.vue';
import Product_Relationships from './product/Relationships.vue';
import Product_Categories from './product/Categories.vue';


const _products_routes = [
    { path: '/products', component: Products,
        children: [
            { path: 'all', name: 'all-products',component: ProductsList },
            { path: 'add', name: 'add-product',component: ProductAdd },
            { path: ':id', component: Product,
                children: [
                    { name: 'product-product', path: 'product', component: Product_Product },
                    { name: 'product-categories', path: 'categories', component: Product_Categories },
                    { name: 'product-attributes', path: 'attributes', component: Product_Attributes },
                    { name: 'product-images', path: 'images', component: Product_Images },
                    { name: 'product-bullets', path: 'bullets', component: Product_Bullets },
                    { name: 'product-ecom', path: 'ecom', component: Product_Ecom },
                    { name: 'product-videos', path: 'videos', component: Product_Videos },
                    { name: 'product-relationships', path: 'relationships', component: Product_Relationships },
                    { name: 'product-edit-product-type', path: 'edit-product-type', component: Product_Product_Type_Edit },
                ]
            }    
        ] 
    }
];

export const products_routes = _products_routes;