# Flood-Susceptibility-Mapping-GEE
Google Earth Engine implementation of Flood Susceptibility Mapping using MCDA and Weighted Overlay.

# Flood Susceptibility Mapping using Google Earth Engine

## Overview

This repository contains a Google Earth Engine (GEE) script for Flood Susceptibility Mapping using a Multi-Criteria Decision Analysis (MCDA) weighted overlay approach.

The model integrates six important flood conditioning factors:

- Elevation
- Slope
- Topographic Wetness Index (TWI)
- Distance from Rivers
- Rainfall (CHIRPS)
- Land Use / Land Cover (ESA WorldCover)

The final Flood Susceptibility Index (FSI) is classified into:

- Very Low
- Low
- Moderate
- High
- Very High

---

## Study Area

Damodar River Basin
(Jharkhand & West Bengal, India)

---

## Data Used

| Dataset | Source |
|---------|--------|
| SRTM DEM | USGS |
| HydroSHEDS | WWF |
| CHIRPS Rainfall | UCSB |
| ESA WorldCover 2021 | ESA |

---

## Methodology

1. Prepare DEM
2. Generate Slope
3. Compute TWI
4. Extract Stream Network
5. Calculate Distance from Rivers
6. Process Rainfall
7. Reclassify all factors
8. Apply Weighted Overlay
9. Generate Flood Susceptibility Index
10. Quantile Classification
11. Calculate Area Statistics
12. Export Results

---

## Weight Assignment

| Factor | Weight |
|---------|---------|
| Elevation | 0.20 |
| Slope | 0.15 |
| TWI | 0.15 |
| Distance from Rivers | 0.20 |
| Rainfall | 0.15 |
| LULC | 0.15 |

---

## Outputs

- Flood Susceptibility Index
- Flood Susceptibility Classes
- Area Statistics
- Bar Chart
- GeoTIFF Export
- CSV Export

---

## Software

- Google Earth Engine
- JavaScript API

---

## Citation

If you use this code in your research, please cite this repository.

---

## Author

Aditya Pal

Department of Geography

VISVA-BHARATI

e Sensing
- Google Earth Engine
- Flood Hazard Mapping
