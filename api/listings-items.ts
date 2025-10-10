import { SPAPIClient } from './client.js';
import { SPAPIResponse } from './types.js';
import { HarnessConfig } from '../config/harness-schema.js';
import { UploadedImage } from './image-upload.js';
import { ConfigManager } from '../utils/config.js';
import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';

export interface ListingItem {
  sku: string;
  asin?: string;
  productType: string;
  requirements: string;
  attributes: Record<string, any>;
}

export interface ListingSubmission {
  submissionId: string;
  submissionType: 'PARTIAL_UPDATE' | 'DELETE';
  marketplaceIds: string[];
  status: 'ACCEPTED' | 'IN_PROGRESS' | 'CANCELLED' | 'DONE' | 'FATAL';
  issues?: Array<{
    code: string;
    message: string;
    severity: 'ERROR' | 'WARNING';
    attributeName?: string;
  }>;
}

export interface CreateListingRequest {
  productType: string;
  requirements: string;
  attributes: Record<string, any>;
}

export interface CreateListingResponse {
  sku: string;
  status: 'ACCEPTED' | 'INVALID';
  submissionId: string;
  asin?: string;
  issues?: Array<{
    code: string;
    message: string;
    severity: 'ERROR' | 'WARNING';
    attributeName?: string;
  }>;
}

export class ListingsItemsAPI {
  private client: SPAPIClient;

  constructor(client: SPAPIClient) {
    this.client = client;
  }

  async createListing(
    harnessConfig: HarnessConfig,
    uploadedImages: UploadedImage[],
    marketplaceIds: string[],
    sellerId: string
  ): Promise<CreateListingResponse> {
    try {
      // Build the listing attributes
      const attributes = this.buildListingAttributes(harnessConfig, uploadedImages, marketplaceIds[0]);

      const request: CreateListingRequest = {
        productType: 'ELECTRONIC_CABLE',
        requirements: 'LISTING',
        attributes,
      };

      // Debug log the request
      if (process.env.DEBUG_MODE === 'true') {
        console.log(chalk.gray('\n🔍 DEBUG: Listing request payload:'));
        console.log(JSON.stringify(request, null, 2));
        console.log(chalk.gray('\nImage URLs being sent:'));
        uploadedImages.forEach((img, idx) => {
          console.log(chalk.gray(`  ${idx + 1}. ${img.amazonUrl}`));
        });
      }

      const response = await this.client.makeRequest<CreateListingResponse>(
        'PUT',
        `/listings/2021-08-01/items/${sellerId}/${harnessConfig.product.sku}`,
        request,
        { marketplaceIds: marketplaceIds.join(',') }
      );

      if (response.errors && response.errors.length > 0) {
        throw new Error(`Failed to create listing: ${response.errors[0].message}`);
      }

      // Handle both payload and direct response formats
      const responseData = response.payload || response;
      const submissionId = (responseData as any).submissionId || '';
      
      // Try to get the ASIN from the created listing
      let asin = '';
      try {
        // Wait a moment for the listing to be processed
        await new Promise(resolve => setTimeout(resolve, 2000));
        const listingDetails = await this.getListing(harnessConfig.product.sku, marketplaceIds);
        if (listingDetails && listingDetails.asin) {
          asin = listingDetails.asin;
          // Save ASIN record
          await this.saveAsinRecord(harnessConfig.product.sku, asin, submissionId);
        }
      } catch (error) {
        console.log(chalk.gray(`💭 Could not retrieve ASIN immediately: ${error instanceof Error ? error.message : String(error)}`));
      }
      
      return {
        sku: harnessConfig.product.sku,
        status: (responseData as any).status || 'ACCEPTED',
        submissionId,
        issues: (responseData as any).issues || [],
        asin
      };

    } catch (error) {
      throw new Error(`Failed to create listing: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getListing(sku: string, marketplaceIds: string[]): Promise<ListingItem | null> {
    try {
      const configManager = new ConfigManager();
      const config = await configManager.load();
      const sellerId = config.amazon.sellerId;

      const params = {
        marketplaceIds: marketplaceIds.join(','),
        includedData: 'summaries,attributes,fulfillmentAvailability,procurement',
      };

      const response = await this.client.makeRequest<ListingItem>(
        'GET',
        `/listings/2021-08-01/items/${sellerId}/${sku}`,
        undefined,
        params
      );

      if (response.errors && response.errors.length > 0) {
        if (response.errors[0].code === 'NOT_FOUND') {
          return null;
        }
        throw new Error(`Failed to get listing: ${response.errors[0].message}`);
      }

      return response.payload || null;

    } catch (error) {
      throw new Error(`Failed to get listing: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async updateListing(
    sku: string,
    harnessConfig: HarnessConfig,
    uploadedImages: UploadedImage[],
    marketplaceIds: string[]
  ): Promise<CreateListingResponse> {
    try {
      // Build the listing attributes
      const attributes = this.buildListingAttributes(harnessConfig, uploadedImages, marketplaceIds[0]);

      const request: CreateListingRequest = {
        productType: 'ELECTRONIC_CABLE',
        requirements: 'LISTING',
        attributes,
      };

      const response = await this.client.makeRequest<CreateListingResponse>(
        'PATCH',
        `/listings/2021-08-01/items/${sku}`,
        request,
        { marketplaceIds: marketplaceIds.join(',') }
      );

      if (response.errors && response.errors.length > 0) {
        throw new Error(`Failed to update listing: ${response.errors[0].message}`);
      }

      if (!response.payload) {
        throw new Error('No response payload received');
      }

      return {
        ...response.payload,
        sku,
      };

    } catch (error) {
      throw new Error(`Failed to update listing: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async deleteListing(sku: string, marketplaceIds: string[]): Promise<void> {
    try {
      const response = await this.client.makeRequest(
        'DELETE',
        `/listings/2021-08-01/items/${sku}`,
        undefined,
        { marketplaceIds: marketplaceIds.join(',') }
      );

      if (response.errors && response.errors.length > 0) {
        throw new Error(`Failed to delete listing: ${response.errors[0].message}`);
      }

    } catch (error) {
      throw new Error(`Failed to delete listing: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getSubmissionStatus(submissionId: string): Promise<ListingSubmission> {
    try {
      const response = await this.client.makeRequest<ListingSubmission>(
        'GET',
        `/listings/2021-08-01/submissions/${submissionId}`
      );

      if (response.errors && response.errors.length > 0) {
        throw new Error(`Failed to get submission status: ${response.errors[0].message}`);
      }

      if (!response.payload) {
        throw new Error('No submission data received');
      }

      return response.payload;

    } catch (error) {
      throw new Error(`Failed to get submission status: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private buildListingAttributes(
    harnessConfig: HarnessConfig,
    uploadedImages: UploadedImage[],
    marketplaceId: string
  ): Record<string, any> {
    const attributes: Record<string, any> = {
      // Basic product information
      item_name: [
        {
          value: harnessConfig.product.title,
          marketplace_id: marketplaceId,
        }
      ],

      brand: [
        {
          value: harnessConfig.product.brand,
          marketplace_id: marketplaceId,
        }
      ],

      manufacturer: [
        {
          value: harnessConfig.product.manufacturer,
          marketplace_id: marketplaceId,
        }
      ],

      // Product description and bullet points
      product_description: [
        {
          value: harnessConfig.product.description,
          marketplace_id: marketplaceId,
        }
      ],

      bullet_point: harnessConfig.amazon.bullet_points.map(point => ({
        value: point,
        marketplace_id: marketplaceId,
      })),

      // Pricing
      list_price: [
        {
          currency: 'USD',
          value: harnessConfig.pricing.price,
          marketplace_id: marketplaceId,
        }
      ],

      // Images - Use exact format from existing products
      main_product_image_locator: uploadedImages.length > 0 ? [
        {
          media_location: uploadedImages[0].amazonUrl,
          marketplace_id: marketplaceId,
        }
      ] : undefined,

      // Additional images
      other_product_image_locator_1: uploadedImages.length > 1 ? [
        {
          media_location: uploadedImages[1].amazonUrl,
          marketplace_id: marketplaceId,
        }
      ] : undefined,

      other_product_image_locator_2: uploadedImages.length > 2 ? [
        {
          media_location: uploadedImages[2].amazonUrl,
          marketplace_id: marketplaceId,
        }
      ] : undefined,

      other_product_image_locator_3: uploadedImages.length > 3 ? [
        {
          media_location: uploadedImages[3].amazonUrl,
          marketplace_id: marketplaceId,
        }
      ] : undefined,

      other_product_image_locator_4: uploadedImages.length > 4 ? [
        {
          media_location: uploadedImages[4].amazonUrl,
          marketplace_id: marketplaceId,
        }
      ] : undefined,

      // FBA ONLY (Fulfilled by Amazon) - no FBM option
      fulfillment_availability: [
        {
          fulfillment_channel_code: 'AMAZON_NA',
          marketplace_id: marketplaceId,
        }
      ],

      // Pricing/Offer information for marketplace
      purchasable_offer: [
        {
          marketplace_id: marketplaceId,
          currency: 'USD',
          our_price: [
            {
              schedule: [
                {
                  value_with_tax: harnessConfig.pricing.price
                }
              ]
            }
          ]
        }
      ],

      // Wire harness specific attributes (using correct Amazon attribute names)
      gauge: [
        {
          decimal_value: parseInt(harnessConfig.specifications.wire_gauge.match(/\d+/)?.[0] || '20'),
          marketplace_id: marketplaceId,
        }
      ],

      cable: [
        {
          length: [
            {
              unit: this.extractLengthUnit(harnessConfig.specifications.length),
              string_value: harnessConfig.specifications.length.match(/\d+(\.\d+)?/)?.[0] || '0',
              decimal_value: parseFloat(harnessConfig.specifications.length.match(/\d+(\.\d+)?/)?.[0] || '0')
            }
          ],
          type: [
            {
              language_tag: 'en_US',
              value: harnessConfig.specifications.cable_type || 'Silicone Wire'
            }
          ],
          marketplace_id: marketplaceId,
        }
      ],

      connector_type: [
        {
          language_tag: 'en_US',
          value: harnessConfig.specifications.connector_type,
          marketplace_id: marketplaceId,
        }
      ],

      number_of_pins: [
        {
          value: harnessConfig.specifications.pin_count,
          marketplace_id: marketplaceId,
        }
      ],

      number_of_items: [
        {
          value: this.extractPackQuantity(harnessConfig.product.sku),
          marketplace_id: marketplaceId,
        }
      ],

      // Search keywords
      generic_keyword: harnessConfig.amazon.search_keywords.slice(0, 5).map(keyword => ({
        value: keyword,
        marketplace_id: marketplaceId,
      })),

      // Required attributes for ELECTRONIC_CABLE
      item_type_keyword: [
        {
          value: 'computer-flat-ribbon-cables',
          marketplace_id: marketplaceId,
        }
      ],

      part_number: [
        {
          value: harnessConfig.product.sku,
          marketplace_id: marketplaceId,
        }
      ],

      included_components: [
        {
          language_tag: 'en_US',
          value: 'Cables',
          marketplace_id: marketplaceId,
        }
      ],

      batteries_required: [
        {
          value: false,
          marketplace_id: marketplaceId,
        }
      ],

      item_package_dimensions: [
        {
          length: {
            unit: 'inches',
            value: 10
          },
          width: {
            unit: 'inches',
            value: 8
          },
          height: {
            unit: 'inches',
            value: 0.49
          },
          marketplace_id: marketplaceId,
        }
      ],

      item_package_weight: [
        {
          unit: 'ounces',
          value: 1,
          marketplace_id: marketplaceId,
        }
      ],

      supplier_declared_dg_hz_regulation: [
        {
          value: 'not_applicable',
          marketplace_id: marketplaceId,
        }
      ],

      // Additional required fields
      connector_gender: [
        {
          language_tag: 'en_US',
          value: harnessConfig.specifications.connector_gender || this.inferConnectorGender(harnessConfig.product.sku),
          marketplace_id: marketplaceId,
        }
      ],

      special_feature: [
        {
          language_tag: 'en_US',
          value: 'Heat Resistant',
          marketplace_id: marketplaceId,
        }
      ],

      compatible_devices: [
        {
          language_tag: 'en_US',
          value: 'Robots',
          marketplace_id: marketplaceId,
        }
      ],

      // Style field for product variations
      style: harnessConfig.specifications.style ? [
        {
          language_tag: 'en_US',
          value: harnessConfig.specifications.style,
          marketplace_id: marketplaceId,
        }
      ] : undefined,

      // Electrical specifications with units
      voltage: harnessConfig.specifications.voltage_rating ? [
        {
          unit: 'volts',
          value: parseFloat(harnessConfig.specifications.voltage_rating.match(/\d+/)?.[0] || '0'),
          marketplace_id: marketplaceId,
        }
      ] : undefined,

      // Remove current_rating field - Amazon doesn't accept it
      // current_rating: harnessConfig.specifications.current_rating ? [
      //   {
      //     unit: 'amperes',
      //     value: parseFloat(harnessConfig.specifications.current_rating.match(/\d+/)?.[0] || '0'),
      //     marketplace_id: marketplaceId,
      //   }
      // ] : undefined,

      country_of_origin: [
        {
          value: 'US',
          marketplace_id: marketplaceId,
        }
      ],
    };

    // For new products without UPC/EAN, add exemption
    if (harnessConfig.amazon.merchant_suggested_asin === 'NEW') {
      attributes.supplier_declared_has_product_identifier_exemption = [
        {
          value: true,
          marketplace_id: marketplaceId,
        }
      ];
    }

    // Only include merchant_suggested_asin if it's a valid ASIN (not "NEW")
    if (harnessConfig.amazon.merchant_suggested_asin !== 'NEW' && harnessConfig.amazon.merchant_suggested_asin.length >= 10) {
      attributes.merchant_suggested_asin = [
        {
          value: harnessConfig.amazon.merchant_suggested_asin,
          marketplace_id: marketplaceId,
        }
      ];
    }

    // Note: parent_asin relationships are handled separately via variation management APIs
    // Amazon SP-API doesn't accept parent_asin directly in listing creation

    // Only include external_product_id for existing products (not new listings)
    if (harnessConfig.amazon.merchant_suggested_asin !== 'NEW') {
      attributes.external_product_id = [
        {
          value: harnessConfig.product.sku,
          type: harnessConfig.amazon.external_product_id_type,
          marketplace_id: marketplaceId,
        }
      ];
    }

    // Remove undefined attributes
    Object.keys(attributes).forEach(key => {
      if (attributes[key] === undefined) {
        delete attributes[key];
      }
    });

    return attributes;
  }

  private extractLengthUnit(lengthString: string): string {
    const lowerLength = lengthString.toLowerCase();
    
    if (lowerLength.includes('inch') || lowerLength.includes('in')) {
      return 'inches';
    } else if (lowerLength.includes('feet') || lowerLength.includes('ft')) {
      return 'feet';
    } else if (lowerLength.includes('mm')) {
      return 'millimeters';
    } else if (lowerLength.includes('cm')) {
      return 'centimeters';
    } else if (lowerLength.includes('meter') || lowerLength.includes('m')) {
      return 'meters';
    } else {
      return 'inches'; // default
    }
  }

  private inferConnectorGender(sku: string): string {
    // Extract connector types from SKU pattern: MPA-{FAMILY}-{PINS}p-{TYPE1}-{TYPE2}-{LENGTH}-{PACK}pk
    const parts = sku.split('-');
    if (parts.length >= 5) {
      const type1 = parts[3]; // First connector type (M/F)
      const type2 = parts[4]; // Second connector type (M/F)
      
      if (type1 === 'M' && type2 === 'M') {
        return 'Male-to-Male';
      } else if (type1 === 'F' && type2 === 'F') {
        return 'Female-to-Female';
      } else if ((type1 === 'M' && type2 === 'F') || (type1 === 'F' && type2 === 'M')) {
        return 'Male-to-Female';
      }
    }
    return 'Male-to-Female'; // Default fallback
  }

  private extractPackQuantity(sku: string): number {
    // Extract pack quantity from SKU pattern: MPA-{FAMILY}-{PINS}p-{TYPE1}-{TYPE2}-{LENGTH}-{PACK}pk
    const parts = sku.split('-');
    if (parts.length >= 7) {
      const packPart = parts[6]; // Pack size part (e.g., "2pk")
      const match = packPart.match(/(\d+)pk/);
      if (match) {
        return parseInt(match[1], 10);
      }
    }
    return 1; // Default fallback
  }

  private async saveAsinRecord(sku: string, asin: string, submissionId: string): Promise<void> {
    try {
      const asinRecordsPath = path.join(process.cwd(), 'production-listings', 'asin-records.json');
      
      // Read existing records or create empty array
      let records = [];
      try {
        const existingData = await fs.readFile(asinRecordsPath, 'utf8');
        records = JSON.parse(existingData);
      } catch (error) {
        // File doesn't exist, start with empty array
        records = [];
      }

      // Add new record
      const newRecord = {
        sku,
        asin,
        submissionId,
        createdAt: new Date().toISOString(),
        listingUrl: `https://www.amazon.com/dp/${asin}`
      };

      // Check if SKU already exists and update, otherwise add new
      const existingIndex = records.findIndex((record: any) => record.sku === sku);
      if (existingIndex >= 0) {
        records[existingIndex] = { ...records[existingIndex], ...newRecord };
        console.log(chalk.yellow(`📝 Updated ASIN record for ${sku}: ${asin}`));
      } else {
        records.push(newRecord);
        console.log(chalk.green(`📝 Saved ASIN record for ${sku}: ${asin}`));
      }

      // Save back to file
      await fs.writeFile(asinRecordsPath, JSON.stringify(records, null, 2));
      
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Could not save ASIN record: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  // Wait for submission to complete
  async waitForSubmissionCompletion(
    submissionId: string,
    maxWaitTime: number = 300000, // 5 minutes
    pollInterval: number = 5000 // 5 seconds
  ): Promise<ListingSubmission> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      const submission = await this.getSubmissionStatus(submissionId);
      
      if (submission.status === 'DONE' || submission.status === 'FATAL' || submission.status === 'CANCELLED') {
        return submission;
      }
      
      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
    
    throw new Error(`Submission ${submissionId} did not complete within ${maxWaitTime / 1000} seconds`);
  }
}