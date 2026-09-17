import { pathToFileURL } from 'node:url';
import { query, tx, migrate, isSeeded, close } from './db.js';
import { mulberry32, hashStr, SYNTHETIC } from './util.js';
import { generateFloor } from './layout.js';
import { synthHistory, insertHistory } from './history.js';

const RATES = {
  mall: { freeMinutes: 15, firstHour: 4000, perAdditionalHour: 3000, dailyCap: 30000, holdFee: 2000 },
  hospital: { freeMinutes: 30, firstHour: 3000, perAdditionalHour: 2000, dailyCap: 20000, holdFee: 1000 },
  metro: { freeMinutes: 10, firstHour: 2000, perAdditionalHour: 1000, dailyCap: 10000, holdFee: 1000 },
  rail: { freeMinutes: 10, firstHour: 2000, perAdditionalHour: 1000, dailyCap: 10000, holdFee: 1000 },
  stadium: { freeMinutes: 10, firstHour: 5000, perAdditionalHour: 5000, dailyCap: 50000, holdFee: 3000 },
  airport: { freeMinutes: 7, firstHour: 12000, perAdditionalHour: 8000, dailyCap: 80000, holdFee: 5000 },
  public: { freeMinutes: 10, firstHour: 2000, perAdditionalHour: 2000, dailyCap: 15000, holdFee: 1000 },
};
const HOURS = {
  mall: ['10:00', '23:00', false], hospital: ['00:00', '23:59', true], metro: ['05:00', '23:30', false], rail: ['00:00', '23:59', true],
  stadium: ['06:00', '22:00', false], airport: ['00:00', '23:59', true], public: ['07:00', '23:00', false],
};
const IMAGES = {
  mall: { emoji: '🛍️', color: '#0BB57A' }, hospital: { emoji: '🏥', color: '#E5484D' }, metro: { emoji: '🚇', color: '#1C7ED6' },
  rail: { emoji: '🚆', color: '#7048E8' }, stadium: { emoji: '🏟️', color: '#F5A524' }, airport: { emoji: '✈️', color: '#0B1220' },
  public: { emoji: '🅿️', color: '#5B6B7F' },
};
const LEVELS = { B3: -3, B2: -2, B1: -1, G: 0, L1: 1, L2: 2, L3: 3 };
const A = {
  mall: 'ev,accessible,covered,cctv,restroom', mallPlus: 'ev,accessible,covered,cctv,valet,restroom,carwash',
  hospital: 'accessible,covered,cctv,24x7,restroom', metro: 'cctv,accessible', rail: 'cctv,24x7,accessible',
  stadium: 'cctv,accessible,restroom', airport: 'ev,accessible,covered,cctv,24x7,restroom,valet', pub: 'cctv,accessible',
};

const VENUES = [
  ['v_orion', 'Orion Mall', 'mall', 'Bengaluru', 'Brigade Gateway, Rajajinagar', 13.011, 77.5551, 'B2,B1,G', 120, A.mallPlus],
  ['v_nexus_kora', 'Nexus Mall Koramangala', 'mall', 'Bengaluru', '80 Feet Rd, Koramangala', 12.9346, 77.6113, 'B2,B1', 140, A.mallPlus],
  ['v_phoenix_wf', 'Phoenix Marketcity', 'mall', 'Bengaluru', 'Whitefield Main Rd, Mahadevapura', 12.9976, 77.6963, 'B2,B1,L1', 150, A.mallPlus],
  ['v_phoenix_moa', 'Phoenix Mall of Asia', 'mall', 'Bengaluru', 'Bellary Rd, Yelahanka', 13.0637, 77.594, 'B3,B2,B1', 160, A.mallPlus],
  ['v_ubcity', 'UB City', 'mall', 'Bengaluru', 'Vittal Mallya Rd, Ashok Nagar', 12.9719, 77.5962, 'B2,B1', 90, 'ev,accessible,covered,cctv,valet'],
  ['v_garuda', 'Garuda Mall', 'mall', 'Bengaluru', 'Magrath Rd, Ashok Nagar', 12.9707, 77.6094, 'B1,G', 100, 'accessible,covered,cctv,restroom'],
  ['v_mantri', 'Mantri Square', 'mall', 'Bengaluru', 'Sampige Rd, Malleshwaram', 12.9915, 77.5703, 'B2,B1', 130, A.mall],
  ['v_lulu', 'Lulu Mall Bengaluru', 'mall', 'Bengaluru', 'Gopalapura, Rajajinagar', 12.9925, 77.5498, 'B2,B1,G', 140, A.mallPlus],
  ['v_vega', 'Vega City Mall', 'mall', 'Bengaluru', 'Bannerghatta Rd, Bilekahalli', 12.9089, 77.602, 'B1,G', 100, 'ev,accessible,covered,cctv'],
  ['v_gopalan', 'Gopalan Innovation Mall', 'mall', 'Bengaluru', 'Bannerghatta Rd, JP Nagar', 12.9089, 77.594, 'B1,G', 80, 'accessible,covered,cctv'],
  ['v_forum_shanti', 'Forum Shantiniketan', 'mall', 'Bengaluru', 'Whitefield Main Rd, Hoodi', 12.9767, 77.7288, 'B2,B1', 130, A.mall],
  ['v_nexus_wf', 'Nexus Whitefield', 'mall', 'Bengaluru', 'Whitefield Main Rd, Whitefield', 12.969, 77.75, 'B1,G', 100, A.mall],
  ['v_vr', 'VR Bengaluru', 'mall', 'Bengaluru', 'ITPL Main Rd, Mahadevapura', 12.9951, 77.696, 'B2,B1', 120, A.mallPlus],
  ['v_royal_meenakshi', 'Royal Meenakshi Mall', 'mall', 'Bengaluru', 'Bannerghatta Rd, Hulimavu', 12.8865, 77.5977, 'B1,G', 90, A.mall],
  ['v_elements', 'Elements Mall', 'mall', 'Bengaluru', 'Thanisandra Main Rd, Nagawara', 13.0555, 77.625, 'B1,G', 90, A.mall],
  ['v_esteem', 'Esteem Mall', 'mall', 'Bengaluru', 'Bellary Rd, Hebbal', 13.039, 77.59, 'G', 60, 'accessible,cctv'],
  ['v_gt_world', 'GT World Mall', 'mall', 'Bengaluru', 'Magadi Rd, Vijayanagar', 12.9765, 77.546, 'B1,G', 80, A.mall],
  ['v_total_madiwala', 'Total Mall Madiwala', 'mall', 'Bengaluru', 'Hosur Rd, Madiwala', 12.9203, 77.618, 'G,L1', 70, 'accessible,cctv,covered'],
  ['v_central_jp', 'Bangalore Central JP Nagar', 'mall', 'Bengaluru', '15th Cross, JP Nagar', 12.913, 77.585, 'B1,G', 70, 'accessible,cctv,covered'],
  ['v_innovative', 'Innovative Multiplex', 'mall', 'Bengaluru', 'Outer Ring Rd, Marathahalli', 12.956, 77.701, 'G', 60, 'cctv,accessible'],
  ['v_brookefield', 'Brookefield Mall', 'mall', 'Bengaluru', 'ITPL Main Rd, Brookefield', 12.968, 77.718, 'B1,G', 70, A.mall],
  ['v_rmz_galleria', 'RMZ Galleria', 'mall', 'Bengaluru', 'Yelahanka New Town', 13.093, 77.585, 'B1,G', 80, A.mall],
  ['v_manipal', 'Manipal Hospital', 'hospital', 'Bengaluru', 'Old Airport Rd, Kodihalli', 12.9592, 77.6493, 'B1,G', 90, `${A.hospital},ev`],
  ['v_apollo', 'Apollo Hospital', 'hospital', 'Bengaluru', 'Bannerghatta Rd, IIM-B', 12.8916, 77.5974, 'B1,G', 80, A.hospital],
  ['v_fortis', 'Fortis Hospital', 'hospital', 'Bengaluru', 'Bannerghatta Rd, Bilekahalli', 12.8946, 77.5977, 'G', 70, A.hospital],
  ['v_narayana', 'Narayana Health City', 'hospital', 'Bengaluru', 'Hosur Rd, Bommasandra', 12.8072, 77.6956, 'G,L1', 100, `${A.hospital},ev`],
  ['v_sakra', 'Sakra World Hospital', 'hospital', 'Bengaluru', 'Outer Ring Rd, Bellandur', 12.933, 77.687, 'B1,G', 80, A.hospital],
  ['v_aster_cmi', 'Aster CMI Hospital', 'hospital', 'Bengaluru', 'Bellary Rd, Hebbal', 13.0552, 77.5928, 'B1,G', 90, `${A.hospital},ev`],
  ['v_columbia_wf', 'Manipal Hospital Whitefield', 'hospital', 'Bengaluru', 'Survey No 10P, Whitefield', 12.988, 77.729, 'G', 60, A.hospital],
  ['v_stjohns', "St. John's Medical College Hospital", 'hospital', 'Bengaluru', 'Sarjapur Rd, Koramangala', 12.9315, 77.6195, 'G', 80, A.hospital],
  ['v_mgroad', 'MG Road Metro (Park & Ride)', 'metro', 'Bengaluru', 'MG Rd, Shivaji Nagar', 12.9756, 77.6068, 'G', 60, `${A.metro},ev`],
  ['v_indiranagar', 'Indiranagar Metro (Park & Ride)', 'metro', 'Bengaluru', 'CMH Rd, Indiranagar', 12.9784, 77.6386, 'G', 50, A.metro],
  ['v_whitefield_m', 'Whitefield (Kadugodi) Metro', 'metro', 'Bengaluru', 'Kadugodi, Whitefield', 12.9955, 77.7587, 'G,L1', 80, `${A.metro},ev,covered`],
  ['v_baiyappanahalli', 'Baiyappanahalli Metro', 'metro', 'Bengaluru', 'Old Madras Rd, Baiyappanahalli', 12.9911, 77.6523, 'G', 70, A.metro],
  ['v_yelachenahalli', 'Yelachenahalli Metro', 'metro', 'Bengaluru', 'Kanakapura Rd, Yelachenahalli', 12.8945, 77.57, 'G', 50, A.metro],
  ['v_nagasandra', 'Nagasandra Metro', 'metro', 'Bengaluru', 'Tumkur Rd, Nagasandra', 13.048, 77.5, 'G,L1', 90, `${A.metro},covered`],
  ['v_kengeri', 'Kengeri Metro', 'metro', 'Bengaluru', 'Mysore Rd, Kengeri', 12.908, 77.479, 'G', 80, A.metro],
  ['v_ksr', 'KSR Bengaluru City Railway Station', 'rail', 'Bengaluru', 'Gubbi Thotadappa Rd, Majestic', 12.9776, 77.5713, 'G,L1', 110, `${A.rail},restroom`],
  ['v_ypr', 'Yeshwanthpur Railway Station', 'rail', 'Bengaluru', 'Tumkur Rd, Yeshwanthpur', 13.0236, 77.5511, 'G', 80, A.rail],
  ['v_krpuram', 'KR Puram Railway Station', 'rail', 'Bengaluru', 'Old Madras Rd, KR Puram', 13.0, 77.679, 'G', 70, A.rail],
  ['v_cantonment', 'Bengaluru Cantonment Railway Station', 'rail', 'Bengaluru', 'Station Rd, Vasanth Nagar', 12.993, 77.6, 'G', 60, A.rail],
  ['v_chinnaswamy', 'M. Chinnaswamy Stadium', 'stadium', 'Bengaluru', 'Queens Rd, Cubbon Park', 12.9788, 77.5996, 'G,L1', 120, A.stadium],
  ['v_kanteerava', 'Sree Kanteerava Stadium', 'stadium', 'Bengaluru', 'Kasturba Rd, Sampangi Rama Nagar', 12.9694, 77.5928, 'G', 100, A.stadium],
  ['v_kia', 'Kempegowda Intl Airport, P1 Multi-level', 'airport', 'Bengaluru', 'KIAL Rd, Devanahalli', 13.1989, 77.7068, 'L1,L2,L3', 160, A.airport],
  ['v_kia_p3', 'Kempegowda Intl Airport, P3 Long Stay', 'airport', 'Bengaluru', 'KIAL Rd, Devanahalli', 13.201, 77.71, 'G', 160, 'accessible,cctv,24x7'],
  ['v_lalbagh', 'Lalbagh West Gate Parking', 'public', 'Bengaluru', 'Lalbagh West Gate, Basavanagudi', 12.9507, 77.5848, 'G', 60, 'cctv'],
  ['v_church', 'Church Street MLCP', 'public', 'Bengaluru', 'Church St, Shanthala Nagar', 12.9737, 77.6083, 'B1,G,L1', 70, `${A.pub},covered`],
  ['v_jayanagar', 'Jayanagar 4th Block Complex', 'public', 'Bengaluru', '4th Block, Jayanagar', 12.928, 77.5836, 'G', 60, A.pub],
  ['v_commercial', 'Commercial Street MLCP', 'public', 'Bengaluru', 'Commercial St, Tasker Town', 12.9822, 77.6086, 'B1,G', 60, `${A.pub},covered`],
  ['v_freedom_park', 'Freedom Park MLCP', 'public', 'Bengaluru', 'Seshadri Rd, Gandhi Nagar', 12.98, 77.581, 'B1,G,L1', 80, `${A.pub},covered`],
  ['v_cubbon', 'Cubbon Park (Bal Bhavan) Parking', 'public', 'Bengaluru', 'Kasturba Rd, Cubbon Park', 12.977, 77.594, 'G', 60, 'cctv'],
  ['v_shantinagar', 'Shantinagar Bus Station', 'public', 'Bengaluru', 'KH Rd, Shantinagar', 12.956, 77.599, 'G,L1', 60, A.pub],
  ['v_iskcon', 'ISKCON Temple Bengaluru', 'public', 'Bengaluru', 'Hare Krishna Hill, Rajajinagar', 13.0098, 77.5511, 'B1,G', 90, `${A.pub},covered`],
  ['v_zoo', 'Bannerghatta Biological Park', 'public', 'Bengaluru', 'Bannerghatta Rd, Bannerghatta', 12.8, 77.577, 'G', 120, 'cctv'],
  ['v_wonderla', 'Wonderla Amusement Park', 'public', 'Bengaluru', 'Mysore Rd, Bidadi', 12.8347, 77.401, 'G', 150, 'cctv,accessible'],
  ['v_biec', 'BIEC Exhibition Centre', 'public', 'Bengaluru', 'Tumkur Rd, Madavara', 13.068, 77.479, 'G,L1', 160, `${A.pub},ev`],
  ['v_palace', 'Bangalore Palace Grounds', 'public', 'Bengaluru', 'Palace Rd, Vasanth Nagar', 12.9987, 77.5921, 'G', 120, 'cctv'],
  ['v_itpl', 'ITPL Visitor Parking', 'public', 'Bengaluru', 'ITPL Main Rd, Whitefield', 12.9855, 77.7367, 'G,L1', 100, `${A.pub},ev,covered`],
  ['v_manyata', 'Manyata Tech Park Visitor Parking', 'public', 'Bengaluru', 'Thanisandra Main Rd, Nagawara', 13.045, 77.62, 'G', 100, `${A.pub},ev`],
  ['v_hsr', 'HSR Layout BDA Complex', 'public', 'Bengaluru', '27th Main, HSR Layout', 12.9116, 77.6389, 'G', 70, A.pub],

  ['v_mum_palladium', 'Phoenix Palladium', 'mall', 'Mumbai', 'Senapati Bapat Marg, Lower Parel', 18.994, 72.825, 'B3,B2,B1', 150, A.mallPlus],
  ['v_mum_rcity', 'R City Mall', 'mall', 'Mumbai', 'LBS Marg, Ghatkopar West', 19.0995, 72.9165, 'B2,B1,G', 140, A.mallPlus],
  ['v_mum_infiniti', 'Infiniti Mall Malad', 'mall', 'Mumbai', 'Link Rd, Malad West', 19.1858, 72.8347, 'B2,B1', 120, A.mall],
  ['v_mum_oberoi', 'Oberoi Mall', 'mall', 'Mumbai', 'Western Express Hwy, Goregaon East', 19.173, 72.86, 'B2,B1', 120, A.mallPlus],
  ['v_mum_lilavati', 'Lilavati Hospital', 'hospital', 'Mumbai', 'Bandra Reclamation, Bandra West', 19.051, 72.829, 'B1,G', 80, A.hospital],
  ['v_mum_kokilaben', 'Kokilaben Dhirubhai Ambani Hospital', 'hospital', 'Mumbai', 'Four Bungalows, Andheri West', 19.131, 72.825, 'B2,B1', 100, `${A.hospital},ev`],
  ['v_mum_wankhede', 'Wankhede Stadium', 'stadium', 'Mumbai', 'D Rd, Churchgate', 18.9389, 72.8258, 'G', 100, A.stadium],
  ['v_mum_bkc', 'BKC Multi-level Car Park', 'public', 'Mumbai', 'G Block, Bandra Kurla Complex', 19.066, 72.868, 'B1,G,L1', 120, `${A.pub},covered,ev`],
  ['v_mum_csmt', 'CSMT Railway Station', 'rail', 'Mumbai', 'DN Rd, Fort', 18.9398, 72.8355, 'G', 80, A.rail],
  ['v_mum_airport', 'CSMIA Terminal 2 Multi-level', 'airport', 'Mumbai', 'Sahar Rd, Andheri East', 19.0975, 72.8745, 'L1,L2,L3', 160, A.airport],

  ['v_del_citywalk', 'Select Citywalk', 'mall', 'Delhi NCR', 'District Centre, Saket', 28.5285, 77.219, 'B2,B1', 150, A.mallPlus],
  ['v_del_moi', 'DLF Mall of India', 'mall', 'Delhi NCR', 'Sector 18, Noida', 28.5677, 77.321, 'B2,B1,G', 160, A.mallPlus],
  ['v_del_ambience', 'Ambience Mall Gurugram', 'mall', 'Delhi NCR', 'NH-8, DLF Phase 3, Gurugram', 28.5044, 77.0963, 'B2,B1,G', 160, A.mallPlus],
  ['v_del_cyberhub', 'Cyber Hub', 'public', 'Delhi NCR', 'DLF Cyber City, Gurugram', 28.495, 77.089, 'B1,G', 120, `${A.pub},covered,ev`],
  ['v_del_aiims', 'AIIMS New Delhi', 'hospital', 'Delhi NCR', 'Ansari Nagar East', 28.5672, 77.21, 'G,L1', 120, A.hospital],
  ['v_del_rajiv', 'Rajiv Chowk Metro (Park & Ride)', 'metro', 'Delhi NCR', 'Connaught Place', 28.6328, 77.2197, 'G', 60, A.metro],
  ['v_del_jln', 'Jawaharlal Nehru Stadium', 'stadium', 'Delhi NCR', 'Lodhi Rd, Pragati Vihar', 28.5828, 77.2338, 'G', 120, A.stadium],
  ['v_del_igi', 'IGI Airport T3 Multi-level', 'airport', 'Delhi NCR', 'Terminal 3, Palam', 28.5562, 77.0999, 'L1,L2,L3', 160, A.airport],
  ['v_del_ndls', 'New Delhi Railway Station', 'rail', 'Delhi NCR', 'Ajmeri Gate Side, Paharganj', 28.6425, 77.2197, 'G,L1', 100, A.rail],

  ['v_hyd_inorbit', 'Inorbit Mall Hyderabad', 'mall', 'Hyderabad', 'Mindspace, Hitec City', 17.4342, 78.3866, 'B2,B1', 140, A.mallPlus],
  ['v_hyd_sarath', 'Sarath City Capital Mall', 'mall', 'Hyderabad', 'Gachibowli-Miyapur Rd, Kondapur', 17.46, 78.36, 'B2,B1,G', 160, A.mallPlus],
  ['v_hyd_sujana', 'Nexus Forum Sujana', 'mall', 'Hyderabad', 'Kukatpally', 17.49, 78.398, 'B1,G', 120, A.mall],
  ['v_hyd_gvk', 'GVK One', 'mall', 'Hyderabad', 'Rd No 1, Banjara Hills', 17.418, 78.448, 'B2,B1', 100, A.mall],
  ['v_hyd_apollo', 'Apollo Hospital Jubilee Hills', 'hospital', 'Hyderabad', 'Film Nagar, Jubilee Hills', 17.42, 78.415, 'B1,G', 90, A.hospital],
  ['v_hyd_uppal', 'Rajiv Gandhi Intl Cricket Stadium', 'stadium', 'Hyderabad', 'Uppal', 17.4066, 78.5505, 'G', 120, A.stadium],
  ['v_hyd_rgia', 'RGIA Airport Multi-level', 'airport', 'Hyderabad', 'Shamshabad', 17.2403, 78.4294, 'L1,L2', 160, A.airport],
  ['v_hyd_ameerpet', 'Ameerpet Metro (Park & Ride)', 'metro', 'Hyderabad', 'Ameerpet', 17.4375, 78.4483, 'G', 60, A.metro],
  ['v_hyd_secbad', 'Secunderabad Railway Station', 'rail', 'Hyderabad', 'Secunderabad', 17.4344, 78.5013, 'G,L1', 100, A.rail],

  ['v_che_phoenix', 'Phoenix Marketcity Chennai', 'mall', 'Chennai', 'Velachery Main Rd, Velachery', 12.9915, 80.2168, 'B2,B1', 150, A.mallPlus],
  ['v_che_express', 'Express Avenue', 'mall', 'Chennai', 'Whites Rd, Royapettah', 13.0587, 80.264, 'B2,B1', 140, A.mallPlus],
  ['v_che_vr', 'VR Chennai', 'mall', 'Chennai', 'Jawaharlal Nehru Rd, Anna Nagar', 13.086, 80.196, 'B2,B1,G', 150, A.mallPlus],
  ['v_che_vijaya', 'Nexus Vijaya Mall', 'mall', 'Chennai', 'Arcot Rd, Vadapalani', 13.05, 80.212, 'B1,G', 120, A.mall],
  ['v_che_apollo', 'Apollo Hospital Greams Road', 'hospital', 'Chennai', 'Greams Lane, Thousand Lights', 13.062, 80.252, 'B1,G', 90, A.hospital],
  ['v_che_chepauk', 'MA Chidambaram Stadium', 'stadium', 'Chennai', 'Chepauk', 13.0627, 80.2792, 'G', 100, A.stadium],
  ['v_che_airport', 'Chennai Airport Multi-level', 'airport', 'Chennai', 'GST Rd, Meenambakkam', 12.9941, 80.1709, 'L1,L2,L3', 160, A.airport],
  ['v_che_central', 'Chennai Central Railway Station', 'rail', 'Chennai', 'Kannappar Thidal, Periyamet', 13.0827, 80.2707, 'G,L1', 100, A.rail],
  ['v_che_marina', 'Marina Beach Parking', 'public', 'Chennai', 'Kamarajar Salai, Marina', 13.05, 80.282, 'G', 80, 'cctv'],

  ['v_pun_phoenix', 'Phoenix Marketcity Pune', 'mall', 'Pune', 'Nagar Rd, Viman Nagar', 18.562, 73.917, 'B2,B1', 150, A.mallPlus],
  ['v_pun_amanora', 'Amanora Mall', 'mall', 'Pune', 'Amanora Park Town, Hadapsar', 18.518, 73.933, 'B2,B1,G', 140, A.mallPlus],
  ['v_pun_seasons', 'Seasons Mall', 'mall', 'Pune', 'Magarpatta City, Hadapsar', 18.515, 73.929, 'B1,G', 100, A.mall],
  ['v_pun_westend', 'Westend Mall', 'mall', 'Pune', 'DP Rd, Aundh', 18.562, 73.808, 'B1,G', 100, A.mall],
  ['v_pun_ruby', 'Ruby Hall Clinic', 'hospital', 'Pune', 'Sassoon Rd, Sangamvadi', 18.532, 73.878, 'B1,G', 70, A.hospital],
  ['v_pun_balewadi', 'Shree Shiv Chhatrapati Stadium', 'stadium', 'Pune', 'Balewadi', 18.576, 73.77, 'G', 120, A.stadium],
  ['v_pun_airport', 'Pune Airport Multi-level', 'airport', 'Pune', 'Lohegaon', 18.582, 73.92, 'L1,L2', 120, A.airport],
  ['v_pun_station', 'Pune Junction Railway Station', 'rail', 'Pune', 'Agarkar Nagar', 18.5286, 73.8743, 'G', 80, A.rail],
  ['v_pun_shivajinagar', 'Shivajinagar Metro (Park & Ride)', 'metro', 'Pune', 'Shivajinagar', 18.531, 73.847, 'G', 50, A.metro],
];

async function insertRows(table, columns, rows) {
  for (let i = 0; i < rows.length; i += 400) {
    const chunk = rows.slice(i, i + 400);
    const params = [];
    const values = chunk.map((r) => `(${r.map((v) => { params.push(v); return `$${params.length}`; }).join(',')})`);
    await query(`insert into ${table} (${columns.join(',')}) values ${values.join(',')} on conflict do nothing`, params);
  }
}

export async function seed({ log = console.log } = {}) {
  const now = new Date();
  const counts = { venues: 0, floors: 0, slots: 0 };
  await tx(async () => {
    for (const [id, name, type, city, address, lat, lng, floorSpec, perFloor, amenities] of VENUES) {
      const key = id.slice(2);
      const floorNames = floorSpec.split(',');
      const [opens, closes, is24h] = HOURS[type];
      await query(`insert into venues (id, name, type, city, address, lat, lng, opens, closes, is24h, amenities, rate, image, floors)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) on conflict (id) do nothing`,
        [id, name, type, city, address, lat, lng, opens, closes, is24h, JSON.stringify(amenities.split(',')), JSON.stringify(RATES[type]), JSON.stringify(IMAGES[type]), floorNames.length]);
      counts.venues++;
      const total = perFloor * floorNames.length;
      const history = SYNTHETIC ? synthHistory(id, type, total, now) : [];
      const rng = mulberry32(hashStr(id));
      let freeLeft = SYNTHETIC ? history[history.length - 1].free : total;
      let slotsLeft = total;
      for (const floorName of floorNames) {
        const floorId = `f_${key}_${floorName.toLowerCase()}`;
        const { layout, slots } = generateFloor({ venueKey: key, floorName, level: LEVELS[floorName], target: perFloor });
        await query(`insert into floors (id, venue_id, name, level, width, height, layout) values ($1,$2,$3,$4,$5,$6,$7) on conflict (id) do nothing`,
          [floorId, id, floorName, LEVELS[floorName], layout.width, layout.height,
            JSON.stringify({ entrances: layout.entrances, lifts: layout.lifts, lanes: layout.lanes, pillars: layout.pillars, zones: layout.zones })]);
        counts.floors++;
        const rows = slots.map((s) => {
          const free = rng() < freeLeft / slotsLeft;
          if (free) freeLeft--;
          slotsLeft--;
          return [s.id, floorId, s.code, s.x, s.y, s.w, s.h, s.type, free ? 'free' : 'occupied', s.distToEntrance, now.toISOString()];
        });
        await insertRows('slots', ['id', 'floor_id', 'code', 'x', 'y', 'w', 'h', 'type', 'status', 'dist_to_entrance', 'updated_at'], rows);
        counts.slots += rows.length;
      }
      if (history.length) await insertHistory(id, history);
    }
  });
  log(`seeded ${counts.venues} venues, ${counts.floors} floors, ${counts.slots} slots${SYNTHETIC ? ' (synthetic occupancy)' : ' (all free, operators set occupancy)'}`);
  return counts;
}

export async function reset() {
  await query(`drop table if exists transactions, sessions, holds, availability_history, slots, floors, venues, vehicles, users, receipt_seq cascade`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--reset')) await reset();
  await migrate();
  if (await isSeeded()) console.log('database already seeded, use --reset to rebuild');
  else await seed();
  await close();
}
