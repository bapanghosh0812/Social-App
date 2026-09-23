import { College } from '../types/index.js';

/**
 * Directory of Indian higher-education institutions.
 *
 * This is factual reference data (names, cities, states, founding years) built
 * from compact structured tables so the list stays broad and easy to extend.
 * Imagery and live student counts are intentionally omitted here — the UI shows
 * a branded monogram, and verified counts are computed live from real members.
 */

type Row = [name: string, shortCode: string, city: string, state: string, est: number, rank?: number];

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);

function build(type: College['type'], rows: Row[], baseWebsite = ''): College[] {
  return rows.map(([name, shortCode, city, state, est, rank]) => ({
    id: `col_${slug(shortCode)}_${slug(city)}`,
    name,
    shortCode,
    type,
    city,
    state,
    verifiedStudentCount: 0,
    logoUrl: '',
    bannerUrl: '',
    nirfRank: rank,
    establishedYear: est,
    website: baseWebsite,
  }));
}

// ---------------------------------------------------------------------------
// IITs
// ---------------------------------------------------------------------------
const IITS: Row[] = [
  ['Indian Institute of Technology Madras', 'IIT Madras', 'Chennai', 'Tamil Nadu', 1959, 1],
  ['Indian Institute of Technology Delhi', 'IIT Delhi', 'New Delhi', 'Delhi', 1961, 2],
  ['Indian Institute of Technology Bombay', 'IIT Bombay', 'Mumbai', 'Maharashtra', 1958, 3],
  ['Indian Institute of Technology Kanpur', 'IIT Kanpur', 'Kanpur', 'Uttar Pradesh', 1959, 4],
  ['Indian Institute of Technology Kharagpur', 'IIT Kharagpur', 'Kharagpur', 'West Bengal', 1951, 5],
  ['Indian Institute of Technology Roorkee', 'IIT Roorkee', 'Roorkee', 'Uttarakhand', 1847, 6],
  ['Indian Institute of Technology Guwahati', 'IIT Guwahati', 'Guwahati', 'Assam', 1994, 7],
  ['Indian Institute of Technology Hyderabad', 'IIT Hyderabad', 'Hyderabad', 'Telangana', 2008, 8],
  ['Indian Institute of Technology (BHU) Varanasi', 'IIT BHU', 'Varanasi', 'Uttar Pradesh', 1919, 15],
  ['Indian Institute of Technology Indore', 'IIT Indore', 'Indore', 'Madhya Pradesh', 2009, 16],
  ['Indian Institute of Technology (ISM) Dhanbad', 'IIT ISM Dhanbad', 'Dhanbad', 'Jharkhand', 1926, 20],
  ['Indian Institute of Technology Ropar', 'IIT Ropar', 'Rupnagar', 'Punjab', 2008, 22],
  ['Indian Institute of Technology Patna', 'IIT Patna', 'Patna', 'Bihar', 2008, 24],
  ['Indian Institute of Technology Gandhinagar', 'IIT Gandhinagar', 'Gandhinagar', 'Gujarat', 2008, 26],
  ['Indian Institute of Technology Bhubaneswar', 'IIT Bhubaneswar', 'Bhubaneswar', 'Odisha', 2008, 28],
  ['Indian Institute of Technology Jodhpur', 'IIT Jodhpur', 'Jodhpur', 'Rajasthan', 2008, 30],
  ['Indian Institute of Technology Mandi', 'IIT Mandi', 'Mandi', 'Himachal Pradesh', 2009, 31],
  ['Indian Institute of Technology Tirupati', 'IIT Tirupati', 'Tirupati', 'Andhra Pradesh', 2015],
  ['Indian Institute of Technology Palakkad', 'IIT Palakkad', 'Palakkad', 'Kerala', 2015],
  ['Indian Institute of Technology Bhilai', 'IIT Bhilai', 'Bhilai', 'Chhattisgarh', 2016],
  ['Indian Institute of Technology Goa', 'IIT Goa', 'Ponda', 'Goa', 2016],
  ['Indian Institute of Technology Jammu', 'IIT Jammu', 'Jammu', 'Jammu and Kashmir', 2016],
  ['Indian Institute of Technology Dharwad', 'IIT Dharwad', 'Dharwad', 'Karnataka', 2016],
];

// ---------------------------------------------------------------------------
// NITs
// ---------------------------------------------------------------------------
const NITS: Row[] = [
  ['National Institute of Technology Tiruchirappalli', 'NIT Trichy', 'Tiruchirappalli', 'Tamil Nadu', 1964, 9],
  ['National Institute of Technology Karnataka, Surathkal', 'NIT Surathkal', 'Mangalore', 'Karnataka', 1960, 12],
  ['National Institute of Technology Rourkela', 'NIT Rourkela', 'Rourkela', 'Odisha', 1961, 19],
  ['National Institute of Technology Warangal', 'NIT Warangal', 'Warangal', 'Telangana', 1959, 21],
  ['National Institute of Technology Calicut', 'NIT Calicut', 'Kozhikode', 'Kerala', 1961, 23],
  ['Motilal Nehru National Institute of Technology Allahabad', 'MNNIT Allahabad', 'Prayagraj', 'Uttar Pradesh', 1961, 44],
  ['Malaviya National Institute of Technology Jaipur', 'MNIT Jaipur', 'Jaipur', 'Rajasthan', 1963, 46],
  ['Visvesvaraya National Institute of Technology Nagpur', 'VNIT Nagpur', 'Nagpur', 'Maharashtra', 1960, 47],
  ['Maulana Azad National Institute of Technology Bhopal', 'MANIT Bhopal', 'Bhopal', 'Madhya Pradesh', 1960, 65],
  ['National Institute of Technology Durgapur', 'NIT Durgapur', 'Durgapur', 'West Bengal', 1960, 43],
  ['National Institute of Technology Silchar', 'NIT Silchar', 'Silchar', 'Assam', 1967, 42],
  ['National Institute of Technology Hamirpur', 'NIT Hamirpur', 'Hamirpur', 'Himachal Pradesh', 1986],
  ['National Institute of Technology Kurukshetra', 'NIT Kurukshetra', 'Kurukshetra', 'Haryana', 1963, 45],
  ['National Institute of Technology Jamshedpur', 'NIT Jamshedpur', 'Jamshedpur', 'Jharkhand', 1960, 90],
  ['Dr. B. R. Ambedkar National Institute of Technology Jalandhar', 'NIT Jalandhar', 'Jalandhar', 'Punjab', 1987, 51],
  ['National Institute of Technology Patna', 'NIT Patna', 'Patna', 'Bihar', 1886, 56],
  ['National Institute of Technology Raipur', 'NIT Raipur', 'Raipur', 'Chhattisgarh', 1956, 76],
  ['National Institute of Technology Srinagar', 'NIT Srinagar', 'Srinagar', 'Jammu and Kashmir', 1960],
  ['National Institute of Technology Agartala', 'NIT Agartala', 'Agartala', 'Tripura', 1965],
  ['National Institute of Technology Delhi', 'NIT Delhi', 'New Delhi', 'Delhi', 2010],
  ['National Institute of Technology Goa', 'NIT Goa', 'Farmagudi', 'Goa', 2010],
  ['National Institute of Technology Meghalaya', 'NIT Meghalaya', 'Shillong', 'Meghalaya', 2010],
  ['National Institute of Technology Puducherry', 'NIT Puducherry', 'Karaikal', 'Puducherry', 2010],
  ['National Institute of Technology Uttarakhand', 'NIT Uttarakhand', 'Srinagar (Garhwal)', 'Uttarakhand', 2009],
  ['National Institute of Technology Andhra Pradesh', 'NIT AP', 'Tadepalligudem', 'Andhra Pradesh', 2015],
  ['Sardar Vallabhbhai National Institute of Technology Surat', 'SVNIT Surat', 'Surat', 'Gujarat', 1961, 62],
];

// ---------------------------------------------------------------------------
// IIITs
// ---------------------------------------------------------------------------
const IIITS: Row[] = [
  ['International Institute of Information Technology Hyderabad', 'IIIT Hyderabad', 'Hyderabad', 'Telangana', 1998],
  ['International Institute of Information Technology Bangalore', 'IIIT Bangalore', 'Bengaluru', 'Karnataka', 1999],
  ['Indraprastha Institute of Information Technology Delhi', 'IIIT Delhi', 'New Delhi', 'Delhi', 2008],
  ['Indian Institute of Information Technology Allahabad', 'IIIT Allahabad', 'Prayagraj', 'Uttar Pradesh', 1999, 84],
  ['Atal Bihari Vajpayee IIITM Gwalior', 'IIITM Gwalior', 'Gwalior', 'Madhya Pradesh', 1997],
  ['Indian Institute of Information Technology Sri City', 'IIIT Sri City', 'Sri City', 'Andhra Pradesh', 2013],
  ['Indian Institute of Information Technology Guwahati', 'IIIT Guwahati', 'Guwahati', 'Assam', 2013],
];

// ---------------------------------------------------------------------------
// IIMs
// ---------------------------------------------------------------------------
const IIMS: Row[] = [
  ['Indian Institute of Management Ahmedabad', 'IIM Ahmedabad', 'Ahmedabad', 'Gujarat', 1961, 1],
  ['Indian Institute of Management Bangalore', 'IIM Bangalore', 'Bengaluru', 'Karnataka', 1973, 2],
  ['Indian Institute of Management Calcutta', 'IIM Calcutta', 'Kolkata', 'West Bengal', 1961, 3],
  ['Indian Institute of Management Lucknow', 'IIM Lucknow', 'Lucknow', 'Uttar Pradesh', 1984, 6],
  ['Indian Institute of Management Kozhikode', 'IIM Kozhikode', 'Kozhikode', 'Kerala', 1996, 4],
  ['Indian Institute of Management Indore', 'IIM Indore', 'Indore', 'Madhya Pradesh', 1996, 8],
  ['Indian Institute of Management Shillong', 'IIM Shillong', 'Shillong', 'Meghalaya', 2007],
  ['Indian Institute of Management Rohtak', 'IIM Rohtak', 'Rohtak', 'Haryana', 2009],
  ['Indian Institute of Management Ranchi', 'IIM Ranchi', 'Ranchi', 'Jharkhand', 2009],
  ['Indian Institute of Management Raipur', 'IIM Raipur', 'Raipur', 'Chhattisgarh', 2010],
  ['Indian Institute of Management Tiruchirappalli', 'IIM Trichy', 'Tiruchirappalli', 'Tamil Nadu', 2011],
  ['Indian Institute of Management Udaipur', 'IIM Udaipur', 'Udaipur', 'Rajasthan', 2011],
  ['Indian Institute of Management Nagpur', 'IIM Nagpur', 'Nagpur', 'Maharashtra', 2015],
  ['Indian Institute of Management Visakhapatnam', 'IIM Visakhapatnam', 'Visakhapatnam', 'Andhra Pradesh', 2015],
  ['Indian Institute of Management Bodh Gaya', 'IIM Bodh Gaya', 'Bodh Gaya', 'Bihar', 2015],
  ['Indian Institute of Management Amritsar', 'IIM Amritsar', 'Amritsar', 'Punjab', 2015],
  ['Indian Institute of Management Sambalpur', 'IIM Sambalpur', 'Sambalpur', 'Odisha', 2015],
  ['Indian Institute of Management Sirmaur', 'IIM Sirmaur', 'Sirmaur', 'Himachal Pradesh', 2015],
  ['Indian Institute of Management Jammu', 'IIM Jammu', 'Jammu', 'Jammu and Kashmir', 2016],
  ['Indian Institute of Management Kashipur', 'IIM Kashipur', 'Kashipur', 'Uttarakhand', 2011],
];

// ---------------------------------------------------------------------------
// AIIMS & top medical
// ---------------------------------------------------------------------------
const MEDICAL: Row[] = [
  ['All India Institute of Medical Sciences Delhi', 'AIIMS Delhi', 'New Delhi', 'Delhi', 1956, 1],
  ['All India Institute of Medical Sciences Bhopal', 'AIIMS Bhopal', 'Bhopal', 'Madhya Pradesh', 2012],
  ['All India Institute of Medical Sciences Bhubaneswar', 'AIIMS Bhubaneswar', 'Bhubaneswar', 'Odisha', 2012],
  ['All India Institute of Medical Sciences Jodhpur', 'AIIMS Jodhpur', 'Jodhpur', 'Rajasthan', 2012],
  ['All India Institute of Medical Sciences Patna', 'AIIMS Patna', 'Patna', 'Bihar', 2012],
  ['All India Institute of Medical Sciences Raipur', 'AIIMS Raipur', 'Raipur', 'Chhattisgarh', 2012],
  ['All India Institute of Medical Sciences Rishikesh', 'AIIMS Rishikesh', 'Rishikesh', 'Uttarakhand', 2012],
  ['All India Institute of Medical Sciences Nagpur', 'AIIMS Nagpur', 'Nagpur', 'Maharashtra', 2018],
  ['All India Institute of Medical Sciences Mangalagiri', 'AIIMS Mangalagiri', 'Guntur', 'Andhra Pradesh', 2018],
  ['All India Institute of Medical Sciences Gorakhpur', 'AIIMS Gorakhpur', 'Gorakhpur', 'Uttar Pradesh', 2019],
  ['Post Graduate Institute of Medical Education & Research', 'PGIMER', 'Chandigarh', 'Chandigarh', 1962, 2],
  ['Christian Medical College Vellore', 'CMC Vellore', 'Vellore', 'Tamil Nadu', 1900, 3],
  ['Jawaharlal Institute of Postgraduate Medical Education & Research', 'JIPMER', 'Puducherry', 'Puducherry', 1823],
  ['King George Medical University', 'KGMU', 'Lucknow', 'Uttar Pradesh', 1905],
  ['Maulana Azad Medical College', 'MAMC', 'New Delhi', 'Delhi', 1958],
];

// ---------------------------------------------------------------------------
// Central & state universities
// ---------------------------------------------------------------------------
const UNIVERSITIES: Row[] = [
  ['University of Delhi', 'DU', 'New Delhi', 'Delhi', 1922, 11],
  ['Jawaharlal Nehru University', 'JNU', 'New Delhi', 'Delhi', 1969, 10],
  ['Banaras Hindu University', 'BHU', 'Varanasi', 'Uttar Pradesh', 1916, 5],
  ['Aligarh Muslim University', 'AMU', 'Aligarh', 'Uttar Pradesh', 1875, 9],
  ['Jamia Millia Islamia', 'JMI', 'New Delhi', 'Delhi', 1920, 3],
  ['University of Hyderabad', 'UoH', 'Hyderabad', 'Telangana', 1974, 10],
  ['Jadavpur University', 'JU', 'Kolkata', 'West Bengal', 1955, 12],
  ['Anna University', 'Anna University', 'Chennai', 'Tamil Nadu', 1978, 13],
  ['University of Calcutta', 'CU', 'Kolkata', 'West Bengal', 1857, 8],
  ['University of Mumbai', 'MU', 'Mumbai', 'Maharashtra', 1857, 65],
  ['Savitribai Phule Pune University', 'SPPU', 'Pune', 'Maharashtra', 1949, 19],
  ['Panjab University', 'PU', 'Chandigarh', 'Chandigarh', 1882, 26],
  ['Osmania University', 'OU', 'Hyderabad', 'Telangana', 1918, 46],
  ['University of Madras', 'UNOM', 'Chennai', 'Tamil Nadu', 1857, 27],
  ['Cochin University of Science and Technology', 'CUSAT', 'Kochi', 'Kerala', 1971],
  ['Visva-Bharati University', 'Visva-Bharati', 'Santiniketan', 'West Bengal', 1921],
  ['Guru Gobind Singh Indraprastha University', 'GGSIPU', 'New Delhi', 'Delhi', 1998],
  ['University of Rajasthan', 'UOR', 'Jaipur', 'Rajasthan', 1947],
  ['Gujarat University', 'GU', 'Ahmedabad', 'Gujarat', 1949],
  ['Bangalore University', 'BU', 'Bengaluru', 'Karnataka', 1964],
];

// ---------------------------------------------------------------------------
// Leading private / deemed universities
// ---------------------------------------------------------------------------
const PRIVATE: Row[] = [
  ['Birla Institute of Technology and Science, Pilani', 'BITS Pilani', 'Pilani', 'Rajasthan', 1964, 20],
  ['Vellore Institute of Technology', 'VIT Vellore', 'Vellore', 'Tamil Nadu', 1984, 11],
  ['Manipal Academy of Higher Education', 'MAHE Manipal', 'Manipal', 'Karnataka', 1953, 7],
  ['SRM Institute of Science and Technology', 'SRM', 'Chennai', 'Tamil Nadu', 1985, 13],
  ['Amity University', 'Amity Noida', 'Noida', 'Uttar Pradesh', 2005],
  ['Lovely Professional University', 'LPU', 'Phagwara', 'Punjab', 2005, 27],
  ['Thapar Institute of Engineering and Technology', 'Thapar', 'Patiala', 'Punjab', 1956, 29],
  ['Ashoka University', 'Ashoka', 'Sonipat', 'Haryana', 2014],
  ['Shiv Nadar University', 'Shiv Nadar', 'Greater Noida', 'Uttar Pradesh', 2011],
  ['O.P. Jindal Global University', 'JGU', 'Sonipat', 'Haryana', 2009],
  ['Christ University', 'Christ', 'Bengaluru', 'Karnataka', 1969],
  ['Symbiosis International University', 'SIU', 'Pune', 'Maharashtra', 2002],
  ['Narsee Monjee Institute of Management Studies', 'NMIMS', 'Mumbai', 'Maharashtra', 1981],
  ['Kalinga Institute of Industrial Technology', 'KIIT', 'Bhubaneswar', 'Odisha', 1992, 24],
  ['Bennett University', 'Bennett', 'Greater Noida', 'Uttar Pradesh', 2016],
  ['PES University', 'PES', 'Bengaluru', 'Karnataka', 1972],
  ['R.V. College of Engineering', 'RVCE', 'Bengaluru', 'Karnataka', 1963],
  ['Birla Institute of Technology, Mesra', 'BIT Mesra', 'Ranchi', 'Jharkhand', 1955],
  ['Delhi Technological University', 'DTU', 'New Delhi', 'Delhi', 1941, 36],
  ['Netaji Subhas University of Technology', 'NSUT', 'New Delhi', 'Delhi', 1983, 60],
  ['College of Engineering Pune', 'COEP', 'Pune', 'Maharashtra', 1854],
  ['Jaypee Institute of Information Technology', 'JIIT', 'Noida', 'Uttar Pradesh', 2001],
  ['Institute of Chemical Technology', 'ICT Mumbai', 'Mumbai', 'Maharashtra', 1933],
];

// ---------------------------------------------------------------------------
// Well-known undergraduate colleges
// ---------------------------------------------------------------------------
const COLLEGES: Row[] = [
  ['St. Stephen\'s College', "St. Stephen's", 'New Delhi', 'Delhi', 1881],
  ['Hindu College', 'Hindu College', 'New Delhi', 'Delhi', 1899],
  ['Miranda House', 'Miranda House', 'New Delhi', 'Delhi', 1948, 1],
  ['Lady Shri Ram College for Women', 'LSR', 'New Delhi', 'Delhi', 1956],
  ['Shri Ram College of Commerce', 'SRCC', 'New Delhi', 'Delhi', 1926],
  ['Hansraj College', 'Hansraj', 'New Delhi', 'Delhi', 1948],
  ['Loyola College', 'Loyola', 'Chennai', 'Tamil Nadu', 1925, 3],
  ['St. Xavier\'s College, Mumbai', "St. Xavier's Mumbai", 'Mumbai', 'Maharashtra', 1869],
  ['Presidency University', 'Presidency', 'Kolkata', 'West Bengal', 1817],
  ['Fergusson College', 'Fergusson', 'Pune', 'Maharashtra', 1885],
  ['Madras Christian College', 'MCC', 'Chennai', 'Tamil Nadu', 1837],
  ['St. Joseph\'s College', "St. Joseph's", 'Bengaluru', 'Karnataka', 1882],
];

export const SEEDED_COLLEGES: College[] = [
  ...build('IIT', IITS),
  ...build('NIT', NITS),
  ...build('University', IIITS), // IIITs categorised under University filter
  ...build('IIM', IIMS),
  ...build('Medical', MEDICAL),
  ...build('University', UNIVERSITIES),
  ...build('University', PRIVATE),
  ...build('College', COLLEGES),
];
