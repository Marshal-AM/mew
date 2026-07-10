#pragma once

#include <stddef.h>
#include <stdint.h>

#define MAX_CATALOG_PRODUCTS 9
#define PRODUCT_ID_MAX 37
#define PRODUCT_NAME_MAX 25

typedef struct {
  char id[PRODUCT_ID_MAX];
  char name[PRODUCT_NAME_MAX];
  uint8_t pos_slot;
} CatalogProduct;

void productCatalogInit();
bool productCatalogSync();
bool productCatalogIsLoaded();
uint8_t productCatalogCount();
const CatalogProduct* productCatalogFindBySlot(uint8_t slot);
const CatalogProduct* productCatalogAt(uint8_t index);
void productCatalogLoop();
