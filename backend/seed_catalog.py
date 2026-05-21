"""
RX Tech – Indian medicine catalog seed (~200 popular SKUs).

Structure:
  Salts × Brands → SKUs.
  Each SKU gets distributed across 2-5 of our 5 distributors with deterministic
  PTR/MRP/margin variance to make "lowest cost" and "best margin" meaningful.
"""
from typing import List, Dict
import hashlib

# Distributor pool (must match server.py distributors list)
DISTRIBUTORS = ["dist-1", "dist-2", "dist-3", "dist-4", "dist-5"]

# (salt, category, emoji, default_pack, base_mrp_per_unit)
# Each entry: list of (brand_name, manufacturer, pack_override?, mrp_override?)
CATALOG: List[Dict] = [
    # =================== ANTIBIOTICS ===================
    {
        "salt": "Azithromycin 500mg", "category": "Antibiotic", "emoji": "💊",
        "pack": "Strip of 3 Tabs", "mrp": 78.50,
        "brands": [
            ("Azee 500", "Cipla", None, None),
            ("Azithral 500", "Alembic", None, 82.00),
            ("Azax 500", "Aristo", None, 74.00),
            ("Zady 500", "Mankind", None, 71.50),
            ("Trulimax 500", "Cadila", None, 86.50),
        ],
    },
    {
        "salt": "Amoxicillin 500mg", "category": "Antibiotic", "emoji": "🟡",
        "pack": "Strip of 10 Caps", "mrp": 92.00,
        "brands": [
            ("Novamox 500", "Cipla", None, None),
            ("Mox 500", "Sun Pharma", None, 88.00),
            ("Amoxil 500", "GSK", None, 98.50),
            ("Amoxin 500", "Wallace", None, 84.00),
        ],
    },
    {
        "salt": "Amoxicillin + Clavulanic Acid 625mg", "category": "Antibiotic", "emoji": "💊",
        "pack": "Strip of 10 Tabs", "mrp": 188.00,
        "brands": [
            ("Augmentin 625", "GSK", None, None),
            ("Clavam 625", "Alkem", None, 178.00),
            ("Moxikind-CV 625", "Mankind", None, 162.00),
            ("Mega-CV 625", "Cipla", None, 192.00),
            ("Bactoclav 625", "Lupin", None, 169.50),
        ],
    },
    {
        "salt": "Cefixime 200mg", "category": "Antibiotic", "emoji": "💊",
        "pack": "Strip of 10 Tabs", "mrp": 148.00,
        "brands": [
            ("Taxim-O 200", "Alkem", None, None),
            ("Mahacef 200", "Mankind", None, 142.00),
            ("Zifi 200", "FDC", None, 156.00),
            ("Cefolac 200", "Macleods", None, 138.50),
        ],
    },
    {
        "salt": "Ciprofloxacin 500mg", "category": "Antibiotic", "emoji": "💊",
        "pack": "Strip of 10 Tabs", "mrp": 64.00,
        "brands": [
            ("Cifran 500", "Sun Pharma", None, None),
            ("Ciplox 500", "Cipla", None, 62.00),
            ("Ciprobid 500", "Cadila", None, 58.00),
            ("Cetil 500", "Macleods", None, 66.50),
        ],
    },
    {
        "salt": "Doxycycline 100mg", "category": "Antibiotic", "emoji": "💊",
        "pack": "Strip of 10 Caps", "mrp": 48.00,
        "brands": [
            ("Doxy 100", "Cipla", None, None),
            ("Doxt 100", "Dr. Reddy's", None, 45.50),
            ("Doxinate 100", "Wallace", None, 42.00),
            ("Microdox 100", "Micro Labs", None, 50.00),
        ],
    },
    {
        "salt": "Levofloxacin 500mg", "category": "Antibiotic", "emoji": "💊",
        "pack": "Strip of 5 Tabs", "mrp": 89.00,
        "brands": [
            ("Levoflox 500", "Cipla", None, None),
            ("Tavanic 500", "Sanofi", None, 124.00),
            ("Levokem 500", "Alkem", None, 82.50),
            ("Lecope 500", "Mankind", None, 78.00),
        ],
    },
    {
        "salt": "Ofloxacin + Ornidazole 200/500mg", "category": "Antibiotic", "emoji": "💊",
        "pack": "Strip of 10 Tabs", "mrp": 118.00,
        "brands": [
            ("Oflox-OZ", "Cipla", None, None),
            ("Zenflox-OZ", "Mankind", None, 108.00),
            ("O2 500", "FDC", None, 112.50),
            ("Oflomac-OZ", "Macleods", None, 124.00),
        ],
    },
    {
        "salt": "Clarithromycin 500mg", "category": "Antibiotic", "emoji": "💊",
        "pack": "Strip of 10 Tabs", "mrp": 312.00,
        "brands": [
            ("Claribid 500", "Alkem", None, None),
            ("Klacid 500", "Abbott", None, 348.00),
            ("Clarimac 500", "Macleods", None, 298.00),
        ],
    },
    {
        "salt": "Metronidazole 400mg", "category": "Antibiotic", "emoji": "💊",
        "pack": "Strip of 15 Tabs", "mrp": 52.00,
        "brands": [
            ("Metrogyl 400", "Alkem", None, None),
            ("Flagyl 400", "Abbott", None, 56.00),
            ("Metron 400", "Wockhardt", None, 48.50),
        ],
    },

    # =================== ANALGESICS / NSAIDs ===================
    {
        "salt": "Paracetamol 650mg", "category": "Analgesic", "emoji": "💊",
        "pack": "Strip of 15 Tabs", "mrp": 45.00,
        "brands": [
            ("Dolo 650", "Micro Labs", None, None),
            ("Crocin 650", "GSK", None, 49.00),
            ("Pacimol 650", "IPCA", None, 42.50),
            ("Calpol 650", "GSK", None, 47.00),
            ("Pyrigesic 650", "East India", None, 38.00),
            ("Fevastin 650", "Wallace", None, 40.00),
        ],
    },
    {
        "salt": "Diclofenac 50mg", "category": "Analgesic", "emoji": "💊",
        "pack": "Strip of 10 Tabs", "mrp": 42.00,
        "brands": [
            ("Voveran 50", "Novartis", None, None),
            ("Dynapar 50", "Troikaa", None, 38.00),
            ("Diclofen 50", "Aristo", None, 34.50),
            ("Reactin 50", "Wockhardt", None, 36.00),
        ],
    },
    {
        "salt": "Aceclofenac 100mg", "category": "Analgesic", "emoji": "💊",
        "pack": "Strip of 10 Tabs", "mrp": 88.00,
        "brands": [
            ("Hifenac 100", "Intas", None, None),
            ("Zerodol 100", "IPCA", None, 92.00),
            ("Aceclo 100", "Aristo", None, 78.00),
            ("Acemiz 100", "Mankind", None, 74.50),
        ],
    },
    {
        "salt": "Aceclofenac + Paracetamol 100/325mg", "category": "Analgesic", "emoji": "💊",
        "pack": "Strip of 10 Tabs", "mrp": 96.00,
        "brands": [
            ("Hifenac-P", "Intas", None, None),
            ("Zerodol-P", "IPCA", None, 102.00),
            ("Acemiz-P", "Mankind", None, 84.00),
            ("Dolokind Plus", "Mankind", None, 88.50),
        ],
    },
    {
        "salt": "Ibuprofen 400mg", "category": "Analgesic", "emoji": "💊",
        "pack": "Strip of 10 Tabs", "mrp": 38.00,
        "brands": [
            ("Brufen 400", "Abbott", None, None),
            ("Ibugesic 400", "Cipla", None, 34.00),
            ("Combiflam Plus", "Sanofi", None, 42.00),
        ],
    },
    {
        "salt": "Tramadol 50mg", "category": "Analgesic", "emoji": "💊",
        "pack": "Strip of 10 Caps", "mrp": 85.00,
        "brands": [
            ("Ultracet", "Janssen", None, None),
            ("Tramazac 50", "Zydus", None, 78.00),
            ("Domadol 50", "Cipla", None, 82.50),
        ],
    },
    {
        "salt": "Nimesulide 100mg", "category": "Analgesic", "emoji": "💊",
        "pack": "Strip of 10 Tabs", "mrp": 34.00,
        "brands": [
            ("Nimegesic 100", "Aristo", None, None),
            ("Nimulid 100", "Panacea", None, 36.50),
            ("Nise 100", "Dr. Reddy's", None, 32.00),
        ],
    },

    # =================== CARDIAC ===================
    {
        "salt": "Atorvastatin 10mg", "category": "Cardiac", "emoji": "❤️",
        "pack": "Strip of 10 Tabs", "mrp": 110.00,
        "brands": [
            ("Atorlip 10", "Cipla", None, None),
            ("Storvas 10", "Sun Pharma", None, 102.00),
            ("Atorva 10", "Zydus", None, 96.00),
            ("Lipikind 10", "Mankind", None, 88.00),
            ("Atocor 10", "Dr. Reddy's", None, 118.00),
        ],
    },
    {
        "salt": "Atorvastatin 20mg", "category": "Cardiac", "emoji": "❤️",
        "pack": "Strip of 10 Tabs", "mrp": 168.00,
        "brands": [
            ("Atorlip 20", "Cipla", None, None),
            ("Storvas 20", "Sun Pharma", None, 158.00),
            ("Lipikind 20", "Mankind", None, 142.00),
            ("Atocor 20", "Dr. Reddy's", None, 174.00),
        ],
    },
    {
        "salt": "Amlodipine 5mg", "category": "Cardiac", "emoji": "❤️",
        "pack": "Strip of 10 Tabs", "mrp": 56.00,
        "brands": [
            ("Amlong 5", "Micro Labs", None, None),
            ("Amlokind 5", "Mankind", None, 48.00),
            ("Amlodac 5", "Zydus", None, 52.50),
            ("Stamlo 5", "Dr. Reddy's", None, 58.00),
            ("Amlopres 5", "Cipla", None, 54.00),
        ],
    },
    {
        "salt": "Telmisartan 40mg", "category": "Cardiac", "emoji": "❤️",
        "pack": "Strip of 10 Tabs", "mrp": 132.00,
        "brands": [
            ("Telma 40", "Glenmark", None, None),
            ("Telpres 40", "Cipla", None, 124.00),
            ("Telsar 40", "Mankind", None, 112.00),
            ("Telmikind 40", "Mankind", None, 108.50),
            ("Telista 40", "Lupin", None, 128.00),
        ],
    },
    {
        "salt": "Losartan 50mg", "category": "Cardiac", "emoji": "❤️",
        "pack": "Strip of 10 Tabs", "mrp": 88.00,
        "brands": [
            ("Losar 50", "Unichem", None, None),
            ("Losakind 50", "Mankind", None, 78.00),
            ("Lostat 50", "Eris", None, 82.50),
            ("Repace 50", "Sun Pharma", None, 92.00),
        ],
    },
    {
        "salt": "Metoprolol 50mg", "category": "Cardiac", "emoji": "❤️",
        "pack": "Strip of 10 Tabs", "mrp": 72.00,
        "brands": [
            ("Metolar 50", "Cipla", None, None),
            ("Metpure 50", "Emcure", None, 68.00),
            ("Metoprol 50", "Sun Pharma", None, 75.50),
        ],
    },
    {
        "salt": "Bisoprolol 5mg", "category": "Cardiac", "emoji": "❤️",
        "pack": "Strip of 10 Tabs", "mrp": 96.00,
        "brands": [
            ("Concor 5", "Merck", None, None),
            ("Bisocar 5", "Sun Pharma", None, 88.00),
            ("Corbis 5", "Lupin", None, 92.00),
        ],
    },
    {
        "salt": "Rosuvastatin 10mg", "category": "Cardiac", "emoji": "❤️",
        "pack": "Strip of 10 Tabs", "mrp": 152.00,
        "brands": [
            ("Rosuvas 10", "Sun Pharma", None, None),
            ("Crestor 10", "AstraZeneca", None, 184.00),
            ("Rozavel 10", "Lupin", None, 142.00),
            ("Rosulip 10", "Cipla", None, 148.50),
        ],
    },
    {
        "salt": "Clopidogrel 75mg", "category": "Cardiac", "emoji": "❤️",
        "pack": "Strip of 10 Tabs", "mrp": 124.00,
        "brands": [
            ("Plavix 75", "Sanofi", None, None),
            ("Clopilet 75", "Sun Pharma", None, 112.00),
            ("Deplatt 75", "Torrent", None, 118.00),
            ("Clopact 75", "Mankind", None, 102.00),
        ],
    },

    # =================== DIABETES ===================
    {
        "salt": "Metformin 500mg", "category": "Diabetes", "emoji": "💊",
        "pack": "Strip of 10 Tabs", "mrp": 38.00,
        "brands": [
            ("Glycomet 500", "USV", None, None),
            ("Glyciphage 500", "Franco-Indian", None, 36.00),
            ("Glucophage 500", "Merck", None, 42.00),
            ("Obimet 500", "Abbott", None, 34.50),
        ],
    },
    {
        "salt": "Glimepiride 2mg", "category": "Diabetes", "emoji": "💊",
        "pack": "Strip of 10 Tabs", "mrp": 95.00,
        "brands": [
            ("Amaryl 2", "Sanofi", None, None),
            ("Glimisave 2", "Eris", None, 86.00),
            ("Glimpid 2", "Mankind", None, 78.00),
            ("Glimer 2", "Cipla", None, 88.50),
        ],
    },
    {
        "salt": "Glimepiride + Metformin 2/500mg", "category": "Diabetes", "emoji": "💊",
        "pack": "Strip of 15 Tabs", "mrp": 168.00,
        "brands": [
            ("Amaryl M 2/500", "Sanofi", None, None),
            ("Glimisave M2", "Eris", None, 152.00),
            ("Glimpid-M Forte", "Mankind", None, 142.00),
            ("Glycomet-GP2", "USV", None, 158.50),
        ],
    },
    {
        "salt": "Sitagliptin 100mg", "category": "Diabetes", "emoji": "💊",
        "pack": "Strip of 15 Tabs", "mrp": 412.00,
        "brands": [
            ("Januvia 100", "MSD", None, None),
            ("Sitazit 100", "Sun Pharma", None, 348.00),
            ("Istavel 100", "Cipla", None, 372.00),
            ("Zita 100", "Glenmark", None, 384.50),
        ],
    },
    {
        "salt": "Vildagliptin 50mg", "category": "Diabetes", "emoji": "💊",
        "pack": "Strip of 14 Tabs", "mrp": 358.00,
        "brands": [
            ("Galvus 50", "Novartis", None, None),
            ("Vysov 50", "USV", None, 322.00),
            ("Jalra 50", "Sun Pharma", None, 312.50),
        ],
    },

    # =================== GASTRIC / GIT ===================
    {
        "salt": "Pantoprazole 40mg", "category": "Gastric", "emoji": "🟢",
        "pack": "Strip of 15 Tabs", "mrp": 124.00,
        "brands": [
            ("Pan 40", "Alkem", None, None),
            ("Pantocid 40", "Sun Pharma", None, 118.00),
            ("Pantop 40", "Aristo", None, 108.00),
            ("Pantoflux 40", "Lupin", None, 114.50),
        ],
    },
    {
        "salt": "Pantoprazole + Domperidone 40/30mg", "category": "Gastric", "emoji": "🟢",
        "pack": "Strip of 10 Caps", "mrp": 168.00,
        "brands": [
            ("Pan-D", "Alkem", None, None),
            ("Pantocid-DSR", "Sun Pharma", None, 158.00),
            ("Pantop-D", "Aristo", None, 146.00),
            ("Pantoprazole-DSR", "Mankind", None, 138.50),
        ],
    },
    {
        "salt": "Omeprazole 20mg", "category": "Gastric", "emoji": "🟠",
        "pack": "Strip of 10 Caps", "mrp": 64.00,
        "brands": [
            ("Omez 20", "Dr. Reddy's", None, None),
            ("Ocid 20", "Cadila", None, 58.00),
            ("Omecip 20", "Cipla", None, 62.50),
            ("Lomac 20", "Cipla", None, 56.00),
        ],
    },
    {
        "salt": "Rabeprazole 20mg", "category": "Gastric", "emoji": "🟢",
        "pack": "Strip of 10 Tabs", "mrp": 112.00,
        "brands": [
            ("Rabium 20", "Intas", None, None),
            ("Razo 20", "Dr. Reddy's", None, 104.00),
            ("Rabicip 20", "Cipla", None, 96.00),
            ("Veloz 20", "Torrent", None, 108.50),
        ],
    },
    {
        "salt": "Esomeprazole 40mg", "category": "Gastric", "emoji": "🟢",
        "pack": "Strip of 10 Tabs", "mrp": 138.00,
        "brands": [
            ("Nexpro 40", "Torrent", None, None),
            ("Esoz 40", "Dr. Reddy's", None, 128.00),
            ("Esofag 40", "Mankind", None, 118.00),
        ],
    },
    {
        "salt": "Domperidone 10mg", "category": "Gastric", "emoji": "💊",
        "pack": "Strip of 10 Tabs", "mrp": 56.00,
        "brands": [
            ("Domstal 10", "Torrent", None, None),
            ("Domperi 10", "Cipla", None, 48.00),
            ("Vomistop 10", "Cipla", None, 52.00),
        ],
    },
    {
        "salt": "Ondansetron 4mg", "category": "Gastric", "emoji": "💊",
        "pack": "Strip of 10 Tabs", "mrp": 74.00,
        "brands": [
            ("Emeset 4", "Cipla", None, None),
            ("Vomikind 4", "Mankind", None, 68.00),
            ("Ondem 4", "Alkem", None, 72.50),
        ],
    },

    # =================== ANTI-ALLERGIC ===================
    {
        "salt": "Cetirizine 10mg", "category": "Antihistamine", "emoji": "💊",
        "pack": "Strip of 10 Tabs", "mrp": 32.00,
        "brands": [
            ("Cetzine 10", "Sun Pharma", None, None),
            ("Alerid 10", "Cipla", None, 28.00),
            ("Cetrizet 10", "Mankind", None, 26.50),
            ("Zyrcold 10", "Wockhardt", None, 29.00),
        ],
    },
    {
        "salt": "Levocetirizine 5mg", "category": "Antihistamine", "emoji": "💊",
        "pack": "Strip of 10 Tabs", "mrp": 58.00,
        "brands": [
            ("Levocet 5", "Sun Pharma", None, None),
            ("Vozet 5", "Glenmark", None, 52.00),
            ("Xyzal 5", "UCB", None, 64.50),
            ("Teczine 5", "Mankind", None, 48.00),
        ],
    },
    {
        "salt": "Fexofenadine 120mg", "category": "Antihistamine", "emoji": "💊",
        "pack": "Strip of 10 Tabs", "mrp": 124.00,
        "brands": [
            ("Allegra 120", "Sanofi", None, None),
            ("Fexova 120", "Cipla", None, 108.00),
            ("Histafree 120", "Mankind", None, 96.00),
            ("Glenfine 120", "Glenmark", None, 112.50),
        ],
    },
    {
        "salt": "Montelukast 10mg", "category": "Antihistamine", "emoji": "💊",
        "pack": "Strip of 10 Tabs", "mrp": 118.00,
        "brands": [
            ("Montair 10", "Cipla", None, None),
            ("Montek 10", "Sun Pharma", None, 108.00),
            ("Romilast 10", "Ranbaxy", None, 102.00),
            ("Telekast 10", "Lupin", None, 112.50),
        ],
    },

    # =================== RESPIRATORY ===================
    {
        "salt": "Salbutamol 4mg", "category": "Respiratory", "emoji": "💊",
        "pack": "Strip of 10 Tabs", "mrp": 28.00,
        "brands": [
            ("Asthalin 4", "Cipla", None, None),
            ("Salbair 4", "Glenmark", None, 24.00),
            ("Ventorlin 4", "GSK", None, 32.00),
        ],
    },
    {
        "salt": "Salbutamol Inhaler 100mcg", "category": "Respiratory", "emoji": "💨",
        "pack": "200 dose Inhaler", "mrp": 168.00,
        "brands": [
            ("Asthalin HFA", "Cipla", None, None),
            ("Ventorlin Inhaler", "GSK", None, 178.00),
            ("Salbair Inhaler", "Glenmark", None, 158.00),
        ],
    },
    {
        "salt": "Budesonide Inhaler 200mcg", "category": "Respiratory", "emoji": "💨",
        "pack": "200 dose Inhaler", "mrp": 384.00,
        "brands": [
            ("Budamate 200", "Cipla", None, None),
            ("Foracort 200", "Cipla", None, 412.00),
            ("Pulmicort 200", "AstraZeneca", None, 448.00),
        ],
    },
    {
        "salt": "Ambroxol 30mg", "category": "Respiratory", "emoji": "💊",
        "pack": "Strip of 10 Tabs", "mrp": 38.00,
        "brands": [
            ("Mucolite 30", "Cipla", None, None),
            ("Ambrolite 30", "Mankind", None, 34.00),
            ("Ambrodil 30", "Aristo", None, 32.50),
        ],
    },
    {
        "salt": "Acebrophylline 100mg", "category": "Respiratory", "emoji": "💊",
        "pack": "Strip of 10 Caps", "mrp": 128.00,
        "brands": [
            ("Pulmoclear", "Aristo", None, None),
            ("Brophyl", "Mankind", None, 118.00),
            ("Acebro 100", "Cipla", None, 112.50),
        ],
    },

    # =================== VITAMINS / SUPPLEMENTS ===================
    {
        "salt": "Cholecalciferol (Vit D3) 60K IU", "category": "Vitamin", "emoji": "🟡",
        "pack": "Strip of 4 Caps", "mrp": 168.00,
        "brands": [
            ("Calcirol 60K", "Cadila", None, None),
            ("D-Rise 60K", "USV", None, 158.00),
            ("D3 Must 60K", "Mankind", None, 142.00),
            ("Uprise D3 60K", "Alkem", None, 152.50),
        ],
    },
    {
        "salt": "Methylcobalamin 1500mcg", "category": "Vitamin", "emoji": "🔴",
        "pack": "Strip of 10 Tabs", "mrp": 92.00,
        "brands": [
            ("Nurokind 1500", "Mankind", None, None),
            ("Methycobal 1500", "Eisai", None, 108.00),
            ("Mecobal 1500", "Sun Pharma", None, 86.00),
            ("Vitcobal 1500", "Cipla", None, 82.50),
        ],
    },
    {
        "salt": "Iron + Folic Acid + Vit B12", "category": "Vitamin", "emoji": "🔴",
        "pack": "Strip of 10 Tabs", "mrp": 84.00,
        "brands": [
            ("Tonoferon", "East India", None, None),
            ("Livogen", "Merck", None, 78.00),
            ("Orofer XT", "Emcure", None, 88.00),
            ("Fefol-Z", "GSK", None, 72.50),
        ],
    },
    {
        "salt": "Calcium + Vit D3 500/250 IU", "category": "Vitamin", "emoji": "🦴",
        "pack": "Strip of 15 Tabs", "mrp": 108.00,
        "brands": [
            ("Shelcal 500", "Torrent", None, None),
            ("CCM 500", "Sun Pharma", None, 96.00),
            ("Calcimax 500", "Wallace", None, 92.00),
            ("Gemcal", "Sun Pharma", None, 102.50),
        ],
    },
    {
        "salt": "Multivitamin + Multimineral", "category": "Vitamin", "emoji": "🌈",
        "pack": "Bottle of 30 Caps", "mrp": 268.00,
        "brands": [
            ("Revital H", "Sun Pharma", None, None),
            ("Becosules", "Pfizer", None, 142.00),
            ("Supradyn", "Abbott", None, 198.00),
            ("Zincovit", "Apex", None, 132.00),
        ],
    },

    # =================== ANTIFUNGAL ===================
    {
        "salt": "Fluconazole 150mg", "category": "Antifungal", "emoji": "💊",
        "pack": "Strip of 1 Tab", "mrp": 38.00,
        "brands": [
            ("Forcan 150", "Cipla", None, None),
            ("Zocon 150", "FDC", None, 34.00),
            ("Flucos 150", "Mankind", None, 30.50),
        ],
    },
    {
        "salt": "Itraconazole 100mg", "category": "Antifungal", "emoji": "💊",
        "pack": "Strip of 10 Caps", "mrp": 248.00,
        "brands": [
            ("Itraspor 100", "Sun Pharma", None, None),
            ("Canditral 100", "Glenmark", None, 232.00),
            ("Itrasys 100", "Cipla", None, 218.00),
        ],
    },
    {
        "salt": "Terbinafine 250mg", "category": "Antifungal", "emoji": "💊",
        "pack": "Strip of 7 Tabs", "mrp": 168.00,
        "brands": [
            ("Terbicip 250", "Cipla", None, None),
            ("Sebifin 250", "Ranbaxy", None, 156.00),
            ("Terbi 250", "Mankind", None, 142.50),
        ],
    },

    # =================== THYROID ===================
    {
        "salt": "Levothyroxine 50mcg", "category": "Thyroid", "emoji": "🦋",
        "pack": "Strip of 100 Tabs", "mrp": 168.00,
        "brands": [
            ("Eltroxin 50", "GSK", None, None),
            ("Thyronorm 50", "Abbott", None, 152.00),
            ("Thyrox 50", "Macleods", None, 138.00),
            ("Thyrofit 50", "Mankind", None, 132.50),
        ],
    },
    {
        "salt": "Levothyroxine 100mcg", "category": "Thyroid", "emoji": "🦋",
        "pack": "Strip of 100 Tabs", "mrp": 196.00,
        "brands": [
            ("Eltroxin 100", "GSK", None, None),
            ("Thyronorm 100", "Abbott", None, 178.00),
            ("Thyrox 100", "Macleods", None, 162.00),
        ],
    },

    # =================== STEROIDS / CORTICOIDS ===================
    {
        "salt": "Prednisolone 10mg", "category": "Steroid", "emoji": "💊",
        "pack": "Strip of 10 Tabs", "mrp": 48.00,
        "brands": [
            ("Wysolone 10", "Pfizer", None, None),
            ("Omnacortil 10", "Macleods", None, 42.00),
            ("Predmet 10", "Sun Pharma", None, 38.50),
        ],
    },
    {
        "salt": "Dexamethasone 0.5mg", "category": "Steroid", "emoji": "💊",
        "pack": "Strip of 10 Tabs", "mrp": 24.00,
        "brands": [
            ("Decdan 0.5", "Merck", None, None),
            ("Dexona 0.5", "Zydus", None, 22.00),
            ("Wymesone 0.5", "Wyeth", None, 26.50),
        ],
    },

    # =================== NEURO / PSYCH ===================
    {
        "salt": "Escitalopram 10mg", "category": "Neuro", "emoji": "🧠",
        "pack": "Strip of 10 Tabs", "mrp": 138.00,
        "brands": [
            ("Cipralex 10", "Lundbeck", None, None),
            ("Nexito 10", "Sun Pharma", None, 118.00),
            ("Stalopam 10", "Cipla", None, 124.50),
            ("S Cital 10", "Mankind", None, 102.00),
        ],
    },
    {
        "salt": "Sertraline 50mg", "category": "Neuro", "emoji": "🧠",
        "pack": "Strip of 10 Tabs", "mrp": 132.00,
        "brands": [
            ("Zoloft 50", "Pfizer", None, None),
            ("Daxid 50", "Sun Pharma", None, 118.00),
            ("Serlift 50", "Torrent", None, 108.00),
        ],
    },
    {
        "salt": "Levetiracetam 500mg", "category": "Neuro", "emoji": "🧠",
        "pack": "Strip of 10 Tabs", "mrp": 218.00,
        "brands": [
            ("Levipil 500", "Sun Pharma", None, None),
            ("Keppra 500", "UCB", None, 268.00),
            ("Torleva 500", "Torrent", None, 198.00),
        ],
    },

    # =================== ANTI-VIRAL / ANTI-MALARIAL ===================
    {
        "salt": "Acyclovir 400mg", "category": "Antiviral", "emoji": "💊",
        "pack": "Strip of 10 Tabs", "mrp": 168.00,
        "brands": [
            ("Zovirax 400", "GSK", None, None),
            ("Acivir 400", "Cipla", None, 142.00),
            ("Cyclovir 400", "FDC", None, 132.50),
        ],
    },
    {
        "salt": "Hydroxychloroquine 200mg", "category": "Antimalarial", "emoji": "💊",
        "pack": "Strip of 10 Tabs", "mrp": 96.00,
        "brands": [
            ("HCQS 200", "Ipca", None, None),
            ("Oxcq 200", "Zydus", None, 88.00),
            ("Plaquenil 200", "Sanofi", None, 124.50),
        ],
    },

    # =================== UROLOGY ===================
    {
        "salt": "Tamsulosin 0.4mg", "category": "Urology", "emoji": "💊",
        "pack": "Strip of 10 Caps", "mrp": 158.00,
        "brands": [
            ("Veltam 0.4", "Cipla", None, None),
            ("Urimax 0.4", "Cipla", None, 152.00),
            ("Tamflo 0.4", "Mankind", None, 132.50),
        ],
    },
    {
        "salt": "Dutasteride 0.5mg", "category": "Urology", "emoji": "💊",
        "pack": "Strip of 10 Caps", "mrp": 412.00,
        "brands": [
            ("Dutas 0.5", "Cipla", None, None),
            ("Veltride 0.5", "Cipla", None, 398.00),
            ("Duprost 0.5", "Sun Pharma", None, 372.50),
        ],
    },

    # =================== DERMATOLOGY ===================
    {
        "salt": "Clobetasol Cream 0.05%", "category": "Dermatology", "emoji": "🧴",
        "pack": "Tube 20g", "mrp": 88.00,
        "brands": [
            ("Clobetamil GM", "Cipla", None, None),
            ("Tenovate Cream", "GSK", None, 92.00),
            ("Powercort Cream", "Sun Pharma", None, 76.50),
        ],
    },
    {
        "salt": "Mupirocin Ointment 2%", "category": "Dermatology", "emoji": "🧴",
        "pack": "Tube 5g", "mrp": 138.00,
        "brands": [
            ("Bactroban", "GSK", None, None),
            ("T-Bact", "GSK", None, 142.00),
            ("Supirocin", "Glenmark", None, 122.50),
        ],
    },

    # =================== PEDIATRIC ===================
    {
        "salt": "Paracetamol Syrup 250mg/5ml", "category": "Pediatric", "emoji": "🍼",
        "pack": "Bottle 60ml", "mrp": 48.00,
        "brands": [
            ("Calpol 250 Syrup", "GSK", None, None),
            ("Crocin 250 Syrup", "GSK", None, 52.00),
            ("Dolo 250 Syrup", "Micro Labs", None, 44.00),
            ("Pacimol 250 Syrup", "IPCA", None, 42.50),
        ],
    },
    {
        "salt": "Ondansetron Syrup 2mg/5ml", "category": "Pediatric", "emoji": "🍼",
        "pack": "Bottle 30ml", "mrp": 56.00,
        "brands": [
            ("Emeset Syrup", "Cipla", None, None),
            ("Vomikind Syrup", "Mankind", None, 48.00),
        ],
    },
    {
        "salt": "Cefpodoxime 50mg/5ml Syrup", "category": "Pediatric", "emoji": "🍼",
        "pack": "Bottle 30ml", "mrp": 168.00,
        "brands": [
            ("Cefoprox DT", "Sun Pharma", None, None),
            ("Doxcef Syrup", "Aristo", None, 142.00),
        ],
    },

    # =================== CONTRACEPTIVES ===================
    {
        "salt": "Levonorgestrel 1.5mg", "category": "Contraceptive", "emoji": "💊",
        "pack": "Strip of 1 Tab", "mrp": 95.00,
        "brands": [
            ("I-Pill", "Piramal", None, None),
            ("Unwanted-72", "Mankind", None, 78.00),
            ("Preventol", "Cipla", None, 72.50),
        ],
    },
]


def _stable_hash_pct(seed: str) -> float:
    """Return a deterministic 0..1 float for a seed string."""
    h = hashlib.md5(seed.encode()).hexdigest()
    return int(h[:8], 16) / 0xFFFFFFFF


def build_products() -> List[dict]:
    """Expand catalog into individual SKU records with per-distributor prices."""
    products: List[dict] = []
    pid = 1
    for group in CATALOG:
        salt = group["salt"]
        category = group["category"]
        emoji = group["emoji"]
        default_pack = group["pack"]
        default_mrp = group["mrp"]
        for brand_name, mfr, pack, mrp_override in group["brands"]:
            sku_id = f"p-{pid}"
            pid += 1
            mrp = mrp_override or default_mrp
            pack_str = pack or default_pack
            # Deterministic distributor assignment: take 2-4 distributors based on hash
            h = _stable_hash_pct(sku_id + brand_name)
            n_dists = 2 + int(h * 4)  # 2..5
            dist_ids = DISTRIBUTORS[: n_dists] if h < 0.5 else DISTRIBUTORS[-n_dists:]
            # Compute prices for each distributor — give variance, then add scheme/margin
            base_ptr = round(mrp * (0.68 + 0.05 * _stable_hash_pct(sku_id + "ptr")), 2)
            prices = []
            for i, did in enumerate(dist_ids):
                variance = (-0.06, 0.0, 0.05, 0.10, -0.03)[i % 5]
                ptr = round(base_ptr * (1 + variance), 2)
                margin = round((mrp - ptr) / mrp * 100, 1)
                # 40% chance of scheme — deterministic by hash
                sch_h = _stable_hash_pct(sku_id + did)
                scheme = None
                if sch_h > 0.6:
                    scheme = "10+1 Free"
                elif sch_h > 0.45:
                    scheme = "5+1 Free"
                elif sch_h > 0.35:
                    scheme = "10+2 Free"
                prices.append({
                    "distributor_id": did,
                    "ptr": ptr,
                    "mrp": mrp,
                    "scheme": scheme,
                    "margin_pct": margin,
                })
            # Best distributor = lowest PTR
            best = min(prices, key=lambda p: p["ptr"])
            stock_h = _stable_hash_pct(sku_id + "stock")
            stock = "in_stock" if stock_h > 0.15 else ("low" if stock_h > 0.05 else "out")
            products.append({
                "id": sku_id,
                "name": brand_name,
                "salt": salt,
                "manufacturer": mfr,
                "pack": pack_str,
                "mrp": mrp,
                "ptr": best["ptr"],
                "scheme": best["scheme"],
                "margin_pct": best["margin_pct"],
                "category": category,
                "distributor_ids": dist_ids,
                "best_distributor_id": best["distributor_id"],
                "stock_status": stock,
                "image_emoji": emoji,
                "prices": prices,
            })
    return products


def get_product_count() -> int:
    return sum(len(c["brands"]) for c in CATALOG)
