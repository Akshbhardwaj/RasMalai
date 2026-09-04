"""
Attribute Entity Resolution Engine
Implements PRD FR6 & O4:
- Fuzzy matching between tabular RoR fields (owner name, khasra/survey number, address)
  and spatial parcel attributes using RapidFuzz (Token Sort Ratio & Levenshtein).
- Rule-based normalization for Indian land administration nomenclature.
"""

import re
from typing import Any, Dict, List, Optional, Tuple
from rapidfuzz import fuzz, utils


class EntityResolutionEngine:
    def __init__(self, min_match_threshold: float = 0.65):
        self.min_match_threshold = min_match_threshold
        
        # Indian honorifics / titles to strip during normalization
        self.honorifics = [
            r"\bsmt\.?\b", r"\bshri\b", r"\bsh\.?\b", r"\bmr\.?\b", r"\bmrs\.?\b",
            r"\blate\b", r"\bdr\.?\b", r"\badv\.?\b", r"\bw/o\b", r"\bs/o\b", r"\bd/o\b"
        ]

    def normalize_khasra(self, khasra: Optional[str]) -> str:
        """
        Normalizes Khasra / Survey numbers (e.g., 'Khasra No. 104/1-A' -> '104/1A').
        """
        if not khasra:
            return ""
        text = str(khasra).strip().lower()
        # Remove prefixes like 'khasra no', 'plot no', 'survey no', 'sy no'
        text = re.sub(r"^(khasra|plot|survey|sy|dag|gat)[\s\.\:\#\-_]*no[\s\.\:\#\-_]*", "", text)
        text = re.sub(r"^(khasra|plot|survey|sy|dag|gat)[\s\.\:\#\-_]*", "", text)
        # Remove internal spaces around slashes or hyphens
        text = re.sub(r"\s*[\/]\s*", "/", text)
        text = re.sub(r"\s*[\-]\s*", "-", text)
        text = re.sub(r"\s+", "", text)
        return text.upper()

    def normalize_name(self, name: Optional[str]) -> str:
        """
        Cleans and standardizes Indian citizen owner names.
        """
        if not name:
            return ""
        text = str(name).strip().lower()
        for h in self.honorifics:
            text = re.sub(h, "", text)
        # Remove multiple spaces and punctuation
        text = re.sub(r"[^\w\s]", " ", text)
        text = re.sub(r"\s+", " ", text).strip()
        return text.title()

    def match_spatial_to_ror(
        self, 
        cadastral_props: Dict[str, Any], 
        ror_records: List[Dict[str, Any]]
    ) -> Tuple[Optional[Dict[str, Any]], float, Dict[str, float]]:
        """
        Finds the best matching tabular RoR record for a spatial cadastral parcel.
        Returns: (best_ror_record, composite_similarity_score, breakdown)
        """
        cad_khasra = self.normalize_khasra(cadastral_props.get("khasra_number") or cadastral_props.get("plot_number") or cadastral_props.get("id"))
        cad_owner = self.normalize_name(cadastral_props.get("owner_name") or cadastral_props.get("owner"))

        best_record = None
        best_score = 0.0
        best_breakdown = {"khasra_score": 0.0, "name_score": 0.0}

        for ror in ror_records:
            ror_khasra = self.normalize_khasra(ror.get("khasra_number") or ror.get("survey_no"))
            ror_owner = self.normalize_name(ror.get("owner_name") or ror.get("proprietor"))

            # Khasra match score
            if cad_khasra and ror_khasra:
                if cad_khasra == ror_khasra:
                    khasra_score = 1.0
                elif cad_khasra in ror_khasra or ror_khasra in cad_khasra:
                    khasra_score = 0.85
                else:
                    khasra_score = fuzz.ratio(cad_khasra, ror_khasra) / 100.0
            else:
                khasra_score = 0.5  # Neutral if missing

            # Owner name fuzzy matching (Token Sort Ratio accounts for word reordering)
            if cad_owner and ror_owner:
                name_score = fuzz.token_sort_ratio(cad_owner, ror_owner) / 100.0
            else:
                name_score = 0.5

            # Weighted composite attribute score (Khasra 60%, Owner 40%)
            composite = round(0.60 * khasra_score + 0.40 * name_score, 4)

            if composite > best_score:
                best_score = composite
                best_record = ror
                best_breakdown = {
                    "khasra_score": round(khasra_score, 2),
                    "name_score": round(name_score, 2)
                }

        return best_record, best_score, best_breakdown
