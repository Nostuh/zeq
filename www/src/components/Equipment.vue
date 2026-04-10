<script>
import zSimpleTableVue from "./tools/zSimpleTable.vue";
import axios from 'axios';
import { uf } from '../../utils/tools.mjs';

export default {    
    name: "Equipment",
    data() {
        return {
            data: [],
            eq: [],
        }
    },
    components: {
        zSimpleTableVue
    },
    methods: {
        add_eq: function() {
            this.$router.push({name:"equipment-add"});
        },
        get_config : function() {
            let that = this;
            return {
                name: { header: "Name"},
                slot: {header:"Slot"},
                dmg: {header: "Dmg"},
                ac: {header: "Ac"},
                str: {header: "Str" },
                con: {header: "Con" },
                dex: {header: "Dex" },
                int: {header: "Int" },
                wis: {header: "Wis" },
                cha: {header: "Cha" },
                hpr: {header: "Hpr"},
                spr: {header: "Spr"},
                hp: {header: "Hp"},
                rphys:{header:"Phys Res"},
                rpsi:{header:"Psi Res"},
                relec:{header:"Elec Res"},
                rmag:{header:"Mag Res"},
                rpoi:{header:"Poi Res"},
                rfire:{header:"Fire Res"},
                rcold:{header:"Cold Res"},
                racid:{header:"Acid Res"},
                rasphx:{header:"Asph Res"},
                eqmob_name:{header:"Eq Mob"},
                note: {header:"Note"},
            };
        },
        get_stat: function(str){
            if (str.includes("user's strength") ) {
                return "str";
            }
            if (str.includes("user's constitution") ) {
                return "con";
            }
            if (str.includes("user's dexterity") ) {
                return "dex";
            }
            if (str.includes("user's intelligence") ) {
                return "int";
            }
            if (str.includes("user's wisdom") ) {
                return "wis";
            }
            if (str.includes("user's charisma") ) {
                return "cha";
            }
            if (str.includes("user's hitpoint") ) {
                return "hpr";
            }
            if (str.includes("user's spellpoint") ) {
                return "spr";
            }
            if (str.includes("user's hitpoints") ) {
                return "hp";
            }

            if (str.includes("user's physical resistance") ) {
                return "rphys";
            }
            if (str.includes("user's electric resistance") ) {
                return "relec";
            }
            if (str.includes("user's psionic resistance") ) {
                return "rpsi";
            }
            if (str.includes("user's magical resistance") ) {
                return "rmag";
            }
            if (str.includes("user's acid resistance") ) {
                return "racid";
            }
            if (str.includes("user's poison resistance") ) {
                return "rpoi";
            }
            if (str.includes("user's fire resistance") ) {
                return "rfire";
            }
            if (str.includes("user's cold resistance") ) {
                return "rcold";
            }
            if (str.includes("user's asphyxiation resistance") ) {
                return "rasphx";
            }
            if (str.includes("It does psionic damage")){
                return "dmg-psi";
            }
            if (str.includes("It does electric damage")){
                return "dmg-elec";
            }
            if (str.includes("It does acid damage")){
                return "dmg-acid";
            }
            if (str.includes("It does cold damage")){
                return "dmg-cold";
            }
            if (str.includes("It does fire damage")){
                return "dmg-fire";
            }
            if (str.includes("It does poison damage")){
                return "dmg-poi";
            }
            if (str.includes("It does asphyxiation damage")){
                return "dmg-asph";
            }
            if (str.includes("It does magical damage")){
                return "dmg-mag";
            }
            if (str.includes("weapon class")){
                return "dmg-phys";
            }
            if (str.includes("armour class for")){
                return "ac";
            }

            if (str.includes("bonus to user's")) {
                return "bonus";
            }

            return false;
        },
        get_amt: function(str) {
            if (str.includes("non-existently") ) {
                return 0;
            }
            if (str.includes("unnoticably") ) {
                return 1;
            }
            if (str.includes("pathetically") ) {
                return 2;
            }
            if (str.includes("pitifully") ) {
                return 3;
            }
            if (str.includes("a tiny bit") ) {
                return 4;
            }
            if (str.includes("poorly") ) {
                return 5;
            }
            if (str.includes("a bit") ) {
                return 6;
            }
            if (str.includes("slightly") ) {
                return 7;
            }
            if (str.includes("somewhat") ) {
                return 8;
            }
            if (str.includes("noticably") ) {
                return 9;
            }
            if (str.includes("adequately") ) {
                return 10;
            }
            if (str.includes("an average amount") ) {
                return 11;
            }
            if (str.includes("a good amount") ) {
                return 12;
            }
            if (str.includes("nicely") ) {
                return 13;
            }
            if (str.includes("strongly") ) {
                return 14;
            }
            if (str.includes("impressively") ) {
                return 15;
            }
            if (str.includes("superbly") ) {
                return 16;
            }
            if (str.includes("tremendously") ) {
                return 17;
            }
            if (str.includes("magnificantly") || str.includes("magnificently") ) {
                return 18;
            }
            if (str.includes("astoundingly") ) {
                return 19;
            }
            if (str.includes("unbelievably much") ) {
                return 20;
            }
            if (str.includes("impossibly much") ) {
                return 30;
            }
            if (str.includes("immensely") ){
                return 31;
            }
            
            if (str.includes("phenomenally") ){
                return 33;
            }
            if (str.includes("ILLEGALLY") ){
                return 50;
            }
            return false;
        },
        get_ac: function(str) {

            if ( str.includes(`negative in general`) ) {
                return -1;
            }
            if ( str.includes(`almost non-existent in general`) ) {
                return 1;
            }
            if ( str.includes(`non-existent in general`) ) {
                return 0;
            }
            if ( str.includes(`pathetic in general`) ) {
                return 2;
            }
            if ( str.includes(`tiny in general`) ) {
                return 3;
            }
            if ( str.includes(`feeble in general`) ) {
                return 4;
            }
            if ( str.includes(`little in general`) ) {
                return 5;
            }
            if ( str.includes(`poor in general`) ) {
                return 6;
            }
            if ( str.includes(`low in general`) ) {
                return 7;
            }
            if ( str.includes(`mediocre in general`) ) {
                return 8;
            }
            if ( str.includes(`decent in general`) ) {
                return 9;
            }
            if ( str.includes(`adequate in general`) ) {
                return 10;
            }
            if ( str.includes(`average in general`) ) {
                return 11;
            }
            if ( str.includes(`good in general`) ) {
                return 12;
            }
            if ( str.includes(`nice in general`) ) {
                return 13;
            }
            if ( str.includes(`excellent in general`) ) {
                return 14;
            }
            if ( str.includes(`superb in general`) ) {
                return 15;
            }
            if ( str.includes(`unbelievable in general`) ) {
                return 16;
            }


            return false;

        }
    },
    mounted: async function() {
        let that = this;
        if ( this.$root.user.first_name === false ) { this.$router.push({name:"dashboard"}); }
        let data = await axios.post('/api/eq/eq',{user_id:this.$root.user.id});
        let eq = data.data;
        
        uf.dloop(eq,function(i,v) {
            let info = v.info.split("\n");


            let tmp = {};
            let bonuses = [];
            tmp.name = info[0].replaceAll(" seems to vibrate rapidly.","");
            // tmp.name = tmp.name.replaceAll(`Timur tells you 'This is all I can find on "`,"");
            // tmp.name = tmp.name.replaceAll(`".'"`,"");

            
            uf.dloop(info,function(ii,line) {
                let line_split = line.split(" ");
                let is_positive = false;
                if ( line_split[1] == "increases" ) {
                    is_positive = true;
                }

                let stat = that.get_stat(line);
                let amt = that.get_amt(line);

                if ( stat == "hp" && amt !==false ) {
                    amt = amt*10;
                }

                if (stat=="dmg-phys") {
                    //returned from weapon class
                    amt = 40;
                }
                
                if ( stat!==false&&stat.includes("dmg-")&&amt!==false ) {
                    let fix = stat.split("-");
                    amt = amt*2.5 + "% " + fix[1];
                    stat = "dmg";
                    is_positive=true;
                }

                if ( stat == "bonus" ) {
                    bonuses.push(line);
                    stat = false;
                }

                if ( stat == "ac" ) {
                    is_positive=true;
                    amt = that.get_ac(line);
                }

                if (stat===false||amt===false ) {
                    //do nothing
                } else if ( is_positive) {
                    tmp[stat] = amt;
                } else {
                    tmp[stat] = -amt;
                }
                

            });
            //tmp.con = info[1];
            tmp.note = v.note;
            if ( bonuses.length > 0 ) {
                if (v.note=="" ){
                    tmp.note += bonuses.join("\n");
                } else {
                    tmp.note += " --- " + bonuses.join("\n");
                }
                
                tmp.note.trim();
            }
            tmp.slot = v.slot;
            tmp.eqmob_name = v.eqmob_name;
            that.eq.push(tmp);
        });

        let table_data = this.$refs.zSimpleTableVue.set_table(
            this.eq,
            this.get_config(),
            {
                display_limit: 100
            }
        );
    }
}
</script>

<style>
th {
position: sticky;
    z-index: 999999;
    top: 65px;
    border: 0 !important; 
    outline: 1px solid;
    outline-offset: -2px;
}


</style>

<template>
    <div>
        <h2>Equipment</h2>
        <button class="btn btn-primary" type="button" @click="add_eq">Add Item</button>
        <br><br><br>
        <zSimpleTableVue ref="zSimpleTableVue"></zSimpleTableVue>
    </div>
</template>