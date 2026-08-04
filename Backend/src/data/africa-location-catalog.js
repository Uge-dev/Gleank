import { nigeriaLocationCatalog } from "./nigeria-location-catalog.js";

// Signup location data is intentionally served by Gleenc rather than fetched
// directly from a third-party browser API. This keeps account creation stable
// when a provider is slow or unavailable, while still allowing Geoapify to
// verify a precise seller pickup pin later in the flow.
const countries = [
  ["DZ", "Algeria", ["Adrar", "Algiers", "Annaba", "Batna", "Béchar", "Béjaïa", "Blida", "Biskra", "Bordj Badji Mokhtar", "Bordj Bou Arréridj", "Bouira", "Boumerdès", "Chlef", "Constantine", "Djelfa", "El Bayadh", "El Oued", "El Tarf", "El Menia", "El Mghair", "El Oued", "Ghardaïa", "Guelma", "Illizi", "In Guezzam", "In Salah", "Jijel", "Khenchela", "Laghouat", "M'sila", "Mascara", "Médéa", "Mila", "Mostaganem", "Naâma", "Oran", "Ouargla", "Ouled Djellal", "Oum El Bouaghi", "Relizane", "Saïda", "Sétif", "Sidi Bel Abbès", "Skikda", "Souk Ahras", "Tamanghasset", "Tébessa", "Tiaret", "Tindouf", "Tipaza", "Tissemsilt", "Tizi Ouzou", "Tlemcen", "Touggourt", "Adrar", "Timimoun", "Djanet"]],
  ["AO", "Angola", ["Bengo", "Benguela", "Bié", "Cabinda", "Cuando Cubango", "Cuanza Norte", "Cuanza Sul", "Cunene", "Huambo", "Huíla", "Luanda", "Lunda Norte", "Lunda Sul", "Malanje", "Moxico", "Namibe", "Uíge", "Zaire"]],
  ["BJ", "Benin", ["Alibori", "Atakora", "Atlantique", "Borgou", "Collines", "Couffo", "Donga", "Littoral", "Mono", "Ouémé", "Plateau", "Zou"]],
  ["BW", "Botswana", ["Central", "Chobe", "Gaborone", "Ghanzi", "Kgalagadi", "Kgatleng", "Kweneng", "North-East", "North-West", "Southeast", "Southern"]],
  ["BF", "Burkina Faso", ["Boucle du Mouhoun", "Cascades", "Centre", "Centre-Est", "Centre-Nord", "Centre-Ouest", "Centre-Sud", "Est", "Hauts-Bassins", "Nord", "Plateau-Central", "Sahel", "Sud-Ouest"]],
  ["BI", "Burundi", ["Bubanza", "Bujumbura Mairie", "Bujumbura Rural", "Bururi", "Cankuzo", "Cibitoke", "Gitega", "Karuzi", "Kayanza", "Kirundo", "Makamba", "Muramvya", "Muyinga", "Mwaro", "Ngozi", "Rutana", "Ruyigi"]],
  ["CV", "Cabo Verde", ["Boa Vista", "Brava", "Maio", "Mosteiros", "Paul", "Praia", "Ribeira Brava", "Ribeira Grande", "Sal", "Santa Catarina", "Santa Cruz", "São Domingos", "São Filipe", "São Lourenço dos Órgãos", "São Miguel", "São Salvador do Mundo", "São Vicente", "Tarrafal"]],
  ["CM", "Cameroon", ["Adamawa", "Centre", "East", "Far North", "Littoral", "North", "Northwest", "South", "Southwest", "West"]],
  ["CF", "Central African Republic", ["Bamingui-Bangoran", "Bangui", "Basse-Kotto", "Haut-Mbomou", "Haute-Kotto", "Kémo", "Lobaye", "Mambéré-Kadéï", "Mbomou", "Nana-Grébizi", "Nana-Mambéré", "Ombella-M'Poko", "Ouaka", "Ouham", "Ouham-Pendé", "Sangha-Mbaéré"]],
  ["TD", "Chad", ["Bahr el Gazel", "Batha", "Borkou", "Chari-Baguirmi", "Ennedi-Est", "Ennedi-Ouest", "Guéra", "Hadjer-Lamis", "Kanem", "Lac", "Logone Occidental", "Logone Oriental", "Mandoul", "Mayo-Kebbi Est", "Mayo-Kebbi Ouest", "Moyen-Chari", "N'Djamena", "Ouaddaï", "Salamat", "Sila", "Tandjilé", "Tibesti", "Wadi Fira"]],
  ["KM", "Comoros", ["Anjouan", "Grande Comore", "Mohéli"]],
  ["CD", "Democratic Republic of the Congo", ["Bas-Uélé", "Équateur", "Haut-Katanga", "Haut-Lomami", "Haut-Uélé", "Ituri", "Kasaï", "Kasaï-Central", "Kasaï-Oriental", "Kinshasa", "Kongo Central", "Kwango", "Kwilu", "Lomami", "Lualaba", "Mai-Ndombe", "Maniema", "Mongala", "Nord-Kivu", "Nord-Ubangi", "Sankuru", "Sud-Kivu", "Sud-Ubangi", "Tanganyika", "Tshopo", "Tshuapa"]],
  ["CG", "Republic of the Congo", ["Bouenza", "Brazzaville", "Cuvette", "Cuvette-Ouest", "Kouilou", "Lékoumou", "Likouala", "Niari", "Plateaux", "Pointe-Noire", "Pool", "Sangha"]],
  ["CI", "Côte d'Ivoire", ["Abidjan", "Agnéby-Tiassa", "Bafing", "Bagoué", "Bélier", "Béré", "Bounkani", "Cavally", "Folon", "Gbêkê", "Gôh", "Gontougo", "Grands-Ponts", "Guémon", "Hambol", "Haut-Sassandra", "Iffou", "Indénié-Djuablin", "Kabadougou", "La Mé", "Lôh-Djiboua", "Marahoué", "Moronou", "Nawa", "Poro", "San-Pédro", "Sud-Comoé", "Tchologo", "Tonkpi", "Worodougou"]],
  ["DJ", "Djibouti", ["Ali Sabieh", "Arta", "Dikhil", "Djibouti", "Obock", "Tadjourah"]],
  ["EG", "Egypt", ["Alexandria", "Aswan", "Asyut", "Beheira", "Beni Suef", "Cairo", "Dakahlia", "Damietta", "Faiyum", "Gharbia", "Giza", "Ismailia", "Kafr El Sheikh", "Luxor", "Matrouh", "Minya", "Monufia", "New Valley", "North Sinai", "Port Said", "Qalyubia", "Qena", "Red Sea", "Sharqia", "Sohag", "South Sinai", "Suez"]],
  ["GQ", "Equatorial Guinea", ["Annobón", "Bioko Norte", "Bioko Sur", "Centro Sur", "Djibloho", "Kié-Ntem", "Litoral", "Wele-Nzas"]],
  ["ER", "Eritrea", ["Anseba", "Central", "Northern Red Sea", "Southern", "Southern Red Sea", "Gash-Barka"]],
  ["SZ", "Eswatini", ["Hhohho", "Lubombo", "Manzini", "Shiselweni"]],
  ["ET", "Ethiopia", ["Addis Ababa", "Afar", "Amhara", "Benishangul-Gumuz", "Central Ethiopia", "Dire Dawa", "Gambela", "Harari", "Oromia", "Sidama", "Somali", "South Ethiopia", "South West Ethiopia", "Tigray"]],
  ["GA", "Gabon", ["Estuaire", "Haut-Ogooué", "Moyen-Ogooué", "Ngounié", "Nyanga", "Ogooué-Ivindo", "Ogooué-Lolo", "Ogooué-Maritime", "Woleu-Ntem"]],
  ["GM", "The Gambia", ["Banjul", "Central River", "Lower River", "North Bank", "Upper River", "West Coast"]],
  ["GH", "Ghana", ["Ahafo", "Ashanti", "Bono", "Bono East", "Central", "Eastern", "Greater Accra", "North East", "Northern", "Oti", "Savannah", "Upper East", "Upper West", "Volta", "Western", "Western North"]],
  ["GN", "Guinea", ["Boké", "Conakry", "Faranah", "Kankan", "Kindia", "Labé", "Mamou", "Nzérékoré"]],
  ["GW", "Guinea-Bissau", ["Bafatá", "Biombo", "Bolama", "Cacheu", "Gabú", "Oio", "Quinara", "Tombali", "Bissau"]],
  ["KE", "Kenya", ["Baringo", "Bomet", "Bungoma", "Busia", "Elgeyo-Marakwet", "Embu", "Garissa", "Homa Bay", "Isiolo", "Kajiado", "Kakamega", "Kericho", "Kiambu", "Kilifi", "Kirinyaga", "Kisii", "Kisumu", "Kitui", "Kwale", "Laikipia", "Lamu", "Machakos", "Makueni", "Mandera", "Meru", "Migori", "Marsabit", "Mombasa", "Murang'a", "Nairobi", "Nakuru", "Nandi", "Narok", "Nyamira", "Nyandarua", "Nyeri", "Samburu", "Siaya", "Taita-Taveta", "Tana River", "Tharaka-Nithi", "Trans Nzoia", "Turkana", "Uasin Gishu", "Vihiga", "Wajir", "West Pokot"]],
  ["LS", "Lesotho", ["Berea", "Butha-Buthe", "Leribe", "Mafeteng", "Maseru", "Mohale's Hoek", "Mokhotlong", "Qacha's Nek", "Quthing", "Thaba-Tseka"]],
  ["LR", "Liberia", ["Bomi", "Bong", "Grand Bassa", "Grand Cape Mount", "Grand Gedeh", "Grand Kru", "Lofa", "Margibi", "Maryland", "Montserrado", "Nimba", "River Cess", "River Gee", "Sinoe"]],
  ["LY", "Libya", ["Benghazi", "Derna", "Ghat", "Jabal al Akhdar", "Jabal al Gharbi", "Jufra", "Kufra", "Marj", "Misrata", "Murqub", "Murzuq", "Nalut", "Nuqat al Khams", "Sabha", "Sirte", "Tripoli", "Wadi al Hayaa", "Wadi al Shatii", "Zawiya", "Jafara", "Butnan", "Azzawiya"]],
  ["MG", "Madagascar", ["Alaotra-Mangoro", "Amoron'i Mania", "Analamanga", "Analanjirofo", "Androy", "Anosy", "Atsimo-Andrefana", "Atsimo-Atsinanana", "Betsiboka", "Boeny", "Bongolava", "Diana", "Fitovinany", "Haute Matsiatra", "Ihorombe", "Itasy", "Melaky", "Menabe", "Sava", "Sofia", "Vakinankaratra", "Vatovavy"]],
  ["MW", "Malawi", ["Central Region", "Northern Region", "Southern Region"]],
  ["ML", "Mali", ["Bamako", "Gao", "Kayes", "Kidal", "Koulikoro", "Ménaka", "Mopti", "Ségou", "Sikasso", "Taoudénit", "Tombouctou"]],
  ["MR", "Mauritania", ["Adrar", "Assaba", "Brakna", "Dakhlet Nouadhibou", "Gorgol", "Guidimaka", "Hodh Ech Chargui", "Hodh El Gharbi", "Inchiri", "Nouakchott-Nord", "Nouakchott-Ouest", "Nouakchott-Sud", "Tagant", "Tiris Zemmour", "Trarza"]],
  ["MU", "Mauritius", ["Black River", "Flacq", "Grand Port", "Moka", "Pamplemousses", "Plaines Wilhems", "Port Louis", "Rivière du Rempart", "Savanne"]],
  ["MA", "Morocco", ["Béni Mellal-Khénifra", "Casablanca-Settat", "Dakhla-Oued Ed-Dahab", "Drâa-Tafilalet", "Fès-Meknès", "Guelmim-Oued Noun", "Laâyoune-Sakia El Hamra", "Marrakesh-Safi", "Oriental", "Rabat-Salé-Kénitra", "Souss-Massa", "Tanger-Tétouan-Al Hoceïma"]],
  ["MZ", "Mozambique", ["Cabo Delgado", "Gaza", "Inhambane", "Manica", "Maputo", "Maputo City", "Nampula", "Niassa", "Sofala", "Tete", "Zambézia"]],
  ["NA", "Namibia", ["Erongo", "Hardap", "Kavango East", "Kavango West", "Karas", "Khomas", "Kunene", "Ohangwena", "Omaheke", "Omusati", "Oshana", "Oshikoto", "Otjozondjupa", "Zambezi"]],
  ["NE", "Niger", ["Agadez", "Diffa", "Dosso", "Maradi", "Niamey", "Tahoua", "Tillabéri", "Zinder"]],
  ["NG", "Nigeria", nigeriaLocationCatalog.states.map((item) => item.name)],
  ["RW", "Rwanda", ["Kigali", "Eastern", "Northern", "Southern", "Western"]],
  ["ST", "São Tomé and Príncipe", ["Água Grande", "Cantagalo", "Caué", "Lembá", "Lobata", "Mé-Zóchi", "Príncipe"]],
  ["SN", "Senegal", ["Dakar", "Diourbel", "Fatick", "Kaffrine", "Kaolack", "Kédougou", "Kolda", "Louga", "Matam", "Saint-Louis", "Sédhiou", "Tambacounda", "Thiès", "Ziguinchor"]],
  ["SC", "Seychelles", ["Anse aux Pins", "Anse Boileau", "Anse Etoile", "Anse Royale", "Baie Lazare", "Baie Sainte Anne", "Beau Vallon", "Bel Air", "Bel Ombre", "Cascade", "Glacis", "Grand Anse Mahé", "Grand Anse Praslin", "La Digue", "Les Mamelles", "Mont Buxton", "Mont Fleuri", "Plaisance", "Pointe La Rue", "Port Glaud", "Roche Caiman", "Saint Louis", "Takamaka"]],
  ["SL", "Sierra Leone", ["Eastern", "North Western", "Northern", "Southern", "Western Area"]],
  ["SO", "Somalia", ["Banadir", "Galmudug", "Hirshabelle", "Jubaland", "Puntland", "South West", "Somaliland"]],
  ["ZA", "South Africa", ["Eastern Cape", "Free State", "Gauteng", "KwaZulu-Natal", "Limpopo", "Mpumalanga", "Northern Cape", "North West", "Western Cape"]],
  ["SS", "South Sudan", ["Central Equatoria", "Eastern Equatoria", "Jonglei", "Lakes", "Northern Bahr el Ghazal", "Unity", "Upper Nile", "Warrap", "Western Bahr el Ghazal", "Western Equatoria"]],
  ["SD", "Sudan", ["Al Jazirah", "Blue Nile", "Central Darfur", "East Darfur", "Gedaref", "Kassala", "Khartoum", "North Darfur", "North Kordofan", "Northern", "Red Sea", "River Nile", "Sennar", "South Darfur", "South Kordofan", "West Darfur", "West Kordofan", "White Nile"]],
  ["TZ", "Tanzania", ["Arusha", "Dar es Salaam", "Dodoma", "Geita", "Iringa", "Kagera", "Katavi", "Kigoma", "Kilimanjaro", "Lindi", "Manyara", "Mara", "Mbeya", "Morogoro", "Mtwara", "Mwanza", "Njombe", "Pemba North", "Pemba South", "Pwani", "Rukwa", "Ruvuma", "Shinyanga", "Simiyu", "Singida", "Songwe", "Tabora", "Tanga", "Zanzibar North", "Zanzibar South", "Zanzibar West"]],
  ["TG", "Togo", ["Centrale", "Kara", "Maritime", "Plateaux", "Savanes"]],
  ["TN", "Tunisia", ["Ariana", "Beja", "Ben Arous", "Bizerte", "Gabès", "Gafsa", "Jendouba", "Kairouan", "Kasserine", "Kebili", "Kef", "Mahdia", "Manouba", "Medenine", "Monastir", "Nabeul", "Sfax", "Sidi Bouzid", "Siliana", "Sousse", "Tataouine", "Tozeur", "Tunis", "Zaghouan"]],
  ["UG", "Uganda", ["Central Region", "Eastern Region", "Northern Region", "Western Region"]],
  ["ZM", "Zambia", ["Central", "Copperbelt", "Eastern", "Luapula", "Lusaka", "Muchinga", "Northern", "North-Western", "Southern", "Western"]],
  ["ZW", "Zimbabwe", ["Bulawayo", "Harare", "Manicaland", "Mashonaland Central", "Mashonaland East", "Mashonaland West", "Masvingo", "Matabeleland North", "Matabeleland South", "Midlands"]],
];

const citySuggestions = {
  NG: new Map(nigeriaLocationCatalog.states.map((item) => [item.name, item.cities])),
  GH: new Map([["Greater Accra", ["Accra", "Tema"]], ["Ashanti", ["Kumasi"]], ["Western", ["Takoradi"]], ["Eastern", ["Koforidua"]]]),
  KE: new Map([["Nairobi", ["Nairobi"]], ["Mombasa", ["Mombasa"]], ["Kisumu", ["Kisumu"]], ["Nakuru", ["Nakuru"]]]),
  ZA: new Map([["Gauteng", ["Johannesburg", "Pretoria"]], ["Western Cape", ["Cape Town"]], ["KwaZulu-Natal", ["Durban", "Pietermaritzburg"]]]),
  EG: new Map([["Cairo", ["Cairo"]], ["Alexandria", ["Alexandria"]], ["Giza", ["Giza"]]]),
};

export const africaLocationCatalog = countries.map(([code, name, stateNames]) => ({
  code,
  name,
  states: stateNames.map((stateName) => ({
    name: stateName,
    cities: citySuggestions[code]?.get(stateName) || [],
  })),
}));

export const africaCountryCodes = new Map(
  africaLocationCatalog.map((country) => [country.name.toLowerCase(), country.code.toLowerCase()]),
);

export function findAfricaCountry(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;
  return africaLocationCatalog.find(
    (country) => country.name.toLowerCase() === normalized || country.code.toLowerCase() === normalized,
  ) || null;
}
