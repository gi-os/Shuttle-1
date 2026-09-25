'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getCart, clearCart, type Cart } from '@/lib/cart';
import { DEFAULT_PRICING, formatMoney, type PricingSettings } from '@/lib/money';

interface DesignData {
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
    textLight: string;
    border: string;
    success: string;
  };
  fonts: {
    titleFont: string;
    bodyFont: string;
  };
  style: {
    cornerRadius: number;
  };
}

interface PresetsData {
  shopType: 'free' | 'po' | 'stripe';
  dataRequired: {
    address: boolean;
    details: boolean;
    extra_notes: boolean;
    shipping_handler: boolean;
    hotel_list: boolean;
    brand?: boolean;
    billing_address?: boolean;
    need_by_date?: boolean;
    budget?: boolean;
    artwork_link?: boolean;
  };
  hotelList: string[];
  brandList?: string[];
  pricing?: PricingSettings;
}

export default function CheckoutPage() {
  const router = useRouter();
  const [cart, setCart] = useState<Cart>({ items: [], total: 0 });
  const [design, setDesign] = useState<DesignData | null>(null);
  const [presets, setPresets] = useState<PresetsData | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form fields - Contact (always required: first name, last name)
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');

  // Form fields - Address
  const [address, setAddress] = useState('');
  const [apt, setApt] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [province, setProvince] = useState('');
  const [postalCode, setPostalCode] = useState('');

  // Form fields - Freight
  const [freightOption, setFreightOption] = useState<'lr-paris' | 'own'>('lr-paris');
  const [freightCompany, setFreightCompany] = useState('');
  const [freightAccount, setFreightAccount] = useState('');
  const [freightContact, setFreightContact] = useState('');
  const [orderNotes, setOrderNotes] = useState('');

  // STS-2.00 fields - PO
  const [poNumber, setPoNumber] = useState('');
  const [poFile, setPoFile] = useState<File | null>(null);
  const poFileRef = useRef<HTMLInputElement>(null);

  // STS-2.00 fields - Hotel
  const [hotelSelection, setHotelSelection] = useState('');

  // Extended fields - Order details (DataRequired brand / need_by_date / budget / artwork_link)
  const [brand, setBrand] = useState('');
  const [needByDate, setNeedByDate] = useState('');
  const [estimatedBudget, setEstimatedBudget] = useState('');
  const [artworkLink, setArtworkLink] = useState('');

  // Extended fields - Billing address (DataRequired billing_address)
  const [billingSameAsShipping, setBillingSameAsShipping] = useState(true);
  const [billingAddress, setBillingAddress] = useState('');
  const [billingApt, setBillingApt] = useState('');
  const [billingCity, setBillingCity] = useState('');
  const [billingCountry, setBillingCountry] = useState('');
  const [billingProvince, setBillingProvince] = useState('');
  const [billingPostalCode, setBillingPostalCode] = useState('');

  const cartHasAttachment = cart.items.some(item => item.attachment);

  useEffect(() => {
    const currentCart = getCart();
    if (currentCart.items.length === 0) {
      router.push('/cart');
      return;
    }
    setCart(currentCart);

    fetch('/api/design')
      .then(r => r.json())
      .then(setDesign)
      .catch(console.error);

    fetch('/api/presets')
      .then(r => r.json())
      .then((data: PresetsData) => {
        setPresets(data);
      })
      .catch(() => {
        // If presets endpoint fails (e.g., old Shuttle), default to free shop with all fields
        setPresets({
          shopType: 'free',
          dataRequired: {
            address: true,
            details: true,
            extra_notes: true,
            shipping_handler: true,
            hotel_list: false,
          },
          hotelList: [],
          brandList: [],
          pricing: DEFAULT_PRICING,
        });
      });
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Validate required fields: name and email
      if (!firstName.trim() || !lastName.trim()) {
        alert('Please enter your first and last name.');
        setIsSubmitting(false);
        return;
      }
      if (!email.trim()) {
        alert('Please enter your email address.');
        setIsSubmitting(false);
        return;
      }

      // For PO shop type, validate PO fields. The PO document is only required here
      // when the cart does not already carry one from a PO Upload product.
      if (presets?.shopType === 'po') {
        if (!poNumber.trim()) {
          alert('Please enter a Purchase Order number.');
          setIsSubmitting(false);
          return;
        }
        if (!poFile && !cartHasAttachment) {
          alert('Please upload a Purchase Order file (PDF, TXT, or Word).');
          setIsSubmitting(false);
          return;
        }
      }

      const dr = presets?.dataRequired;
      const shippingAddress = dr?.address
        ? `${firstName} ${lastName}\n${address}${apt ? '\n' + apt : ''}\n${city}, ${province} ${postalCode}\n${country}`
        : '';
      const billingAddressValue = !dr?.billing_address
        ? ''
        : billingSameAsShipping && dr.address
          ? shippingAddress
          : `${billingAddress}${billingApt ? '\n' + billingApt : ''}\n${billingCity}, ${billingProvince} ${billingPostalCode}\n${billingCountry}`;
      const extendedFields = {
        brand: dr?.brand ? brand : '',
        billingAddress: billingAddressValue,
        needByDate: dr?.need_by_date ? needByDate : '',
        estimatedBudget: dr?.budget ? estimatedBudget : '',
        artworkLink: dr?.artwork_link ? artworkLink.trim() : '',
      };

      const orderData = {
        name: `${firstName} ${lastName}`,
        email,
        phone: presets?.dataRequired.details ? phone : '',
        company: presets?.dataRequired.details ? company : '',
        shippingAddress,
        freightOption: presets?.dataRequired.shipping_handler ? freightOption : '',
        freightCompany: presets?.dataRequired.shipping_handler && freightOption === 'own' ? freightCompany : '',
        freightAccount: presets?.dataRequired.shipping_handler && freightOption === 'own' ? freightAccount : '',
        freightContact: presets?.dataRequired.shipping_handler && freightOption === 'own' ? freightContact : '',
        orderNotes: presets?.dataRequired.extra_notes ? orderNotes : '',
        items: cart.items,
        total: cart.total,
        shopType: presets?.shopType || 'free',
        poNumber: presets?.shopType === 'po' ? poNumber : '',
        hotelSelection: presets?.dataRequired.hotel_list ? hotelSelection : '',
        ...extendedFields,
      };

      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(orderData),
      });

      const result = await response.json();

      if (response.status === 409 && result.outOfStockItems) {
        const itemLines = result.outOfStockItems
          .map((item: { productName: string; requested: number; available: number }) =>
            `- ${item.productName}: requested ${item.requested}, only ${item.available} left in stock`
          )
          .join('\n');
        alert(`Some items are no longer available:\n\n${itemLines}\n\nPlease go back to your cart and update quantities.`);
        setIsSubmitting(false);
        return;
      }

      if (!response.ok) {
        if (response.status === 400 && result.error) {
          alert(result.error);
          setIsSubmitting(false);
          return;
        }
        throw new Error('Failed to submit order');
      }

      // Upload PO file if this is a PO shop and the order has no PO Upload product document
      if (presets?.shopType === 'po' && poFile && !result.poFile) {
        const formData = new FormData();
        formData.append('po_file', poFile);
        formData.append('order_id', result.orderId);

        const uploadResponse = await fetch('/api/orders/upload-po', {
          method: 'POST',
          body: formData,
        });

        if (!uploadResponse.ok) {
          console.error('Failed to upload PO file, but order was submitted');
        }
      }

      // Save order data for receipt download on success page
      sessionStorage.setItem('lastOrder', JSON.stringify({
        orderId: result.orderId,
        date: new Date().toISOString(),
        name: `${firstName} ${lastName}`,
        company,
        items: cart.items,
        total: cart.total,
        shopType: presets?.shopType || 'free',
        poNumber: presets?.shopType === 'po' ? poNumber : '',
        hotelSelection: presets?.dataRequired.hotel_list ? hotelSelection : '',
        ...extendedFields,
        pricing: presets?.pricing || DEFAULT_PRICING,
      }));

      // Clear cart
      clearCart();
      window.dispatchEvent(new Event('cartUpdated'));

      // Redirect to success page
      router.push(`/order-success?orderId=${result.orderId}`);
    } catch (error) {
      console.error('Error submitting order:', error);
      alert('Failed to submit order. Please try again.');
      setIsSubmitting(false);
    }
  };

  if (!design || !presets) {
    return (
      <div className="container mx-auto px-4 py-12">
        <p>Loading...</p>
      </div>
    );
  }

  const dr = presets.dataRequired;
  const pricing = presets.pricing || DEFAULT_PRICING;
  const brandList = presets.brandList || [];
  const today = new Date().toISOString().split('T')[0];
  const inputClass = 'w-full px-4 py-2 border focus:outline-none focus:ring-2';
  const inputStyle = { borderColor: design.colors.border, borderRadius: `${design.style.cornerRadius}px`, fontFamily: design.fonts.bodyFont };
  const labelClass = 'block text-sm font-semibold mb-2';
  const labelStyle = { color: design.colors.text, fontFamily: design.fonts.bodyFont };
  const sectionStyle = { borderColor: design.colors.border, borderRadius: `${design.style.cornerRadius}px` };
  const headingStyle = { color: design.colors.primary, fontFamily: design.fonts.titleFont };
  const attachedItems = cart.items.filter(item => item.attachment);

  return (
    <div className="container mx-auto px-4 py-12">
      <h1 className="text-4xl font-bold mb-8" style={{ color: design.colors.primary, fontFamily: design.fonts.titleFont }}>
        Checkout
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Checkout Form */}
        <div className="lg:col-span-2">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Contact Information - always shown (name always required) */}
            <div className="border p-6" style={{ borderColor: design.colors.border, borderRadius: `${design.style.cornerRadius}px` }}>
              <h2 className="text-2xl font-bold mb-4" style={{ color: design.colors.primary, fontFamily: design.fonts.titleFont }}>
                Contact Information
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-2" style={{ color: design.colors.text, fontFamily: design.fonts.bodyFont }}>
                    First name *
                  </label>
                  <input
                    type="text"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full px-4 py-2 border focus:outline-none focus:ring-2"
                    style={{ borderColor: design.colors.border, borderRadius: `${design.style.cornerRadius}px`, fontFamily: design.fonts.bodyFont }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2" style={{ color: design.colors.text, fontFamily: design.fonts.bodyFont }}>
                    Last name *
                  </label>
                  <input
                    type="text"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full px-4 py-2 border focus:outline-none focus:ring-2"
                    style={{ borderColor: design.colors.border, borderRadius: `${design.style.cornerRadius}px`, fontFamily: design.fonts.bodyFont }}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold mb-2" style={{ color: design.colors.text, fontFamily: design.fonts.bodyFont }}>
                    Email *
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-2 border focus:outline-none focus:ring-2"
                    style={{ borderColor: design.colors.border, borderRadius: `${design.style.cornerRadius}px`, fontFamily: design.fonts.bodyFont }}
                  />
                </div>
                {dr.details && (
                  <>
                    <div>
                      <label className="block text-sm font-semibold mb-2" style={{ color: design.colors.text, fontFamily: design.fonts.bodyFont }}>
                        Phone
                      </label>
                      <input
                        type="tel"
                        required
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="w-full px-4 py-2 border focus:outline-none focus:ring-2"
                        style={{ borderColor: design.colors.border, borderRadius: `${design.style.cornerRadius}px`, fontFamily: design.fonts.bodyFont }}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold mb-2" style={{ color: design.colors.text, fontFamily: design.fonts.bodyFont }}>
                        Company
                      </label>
                      <input
                        type="text"
                        required
                        value={company}
                        onChange={(e) => setCompany(e.target.value)}
                        className="w-full px-4 py-2 border focus:outline-none focus:ring-2"
                        style={{ borderColor: design.colors.border, borderRadius: `${design.style.cornerRadius}px`, fontFamily: design.fonts.bodyFont }}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Order Details - brand / need-by / budget / artwork link toggles */}
            {(dr.brand || dr.need_by_date || dr.budget || dr.artwork_link) && (
              <div className="border p-6" style={sectionStyle}>
                <h2 className="text-2xl font-bold mb-4" style={headingStyle}>
                  Order Details
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {dr.brand && (
                    <div className="md:col-span-2">
                      <label htmlFor="brand" className={labelClass} style={labelStyle}>
                        Brand *
                      </label>
                      {brandList.length > 0 ? (
                        <select
                          id="brand"
                          required
                          value={brand}
                          onChange={(e) => setBrand(e.target.value)}
                          className={`${inputClass} bg-white`}
                          style={inputStyle}
                        >
                          <option value="">-- Select a brand --</option>
                          {brandList.map((b) => (
                            <option key={b} value={b}>
                              {b}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          id="brand"
                          type="text"
                          required
                          value={brand}
                          onChange={(e) => setBrand(e.target.value)}
                          className={inputClass}
                          style={inputStyle}
                        />
                      )}
                    </div>
                  )}
                  {dr.need_by_date && (
                    <div>
                      <label htmlFor="need-by-date" className={labelClass} style={labelStyle}>
                        Need-by date *
                      </label>
                      <input
                        id="need-by-date"
                        type="date"
                        required
                        min={today}
                        value={needByDate}
                        onChange={(e) => setNeedByDate(e.target.value)}
                        className={inputClass}
                        style={inputStyle}
                      />
                    </div>
                  )}
                  {dr.budget && (
                    <div>
                      <label htmlFor="estimated-budget" className={labelClass} style={labelStyle}>
                        Estimated budget ({pricing.currency})
                      </label>
                      <input
                        id="estimated-budget"
                        type="number"
                        min="0"
                        step="any"
                        value={estimatedBudget}
                        onChange={(e) => setEstimatedBudget(e.target.value)}
                        className={inputClass}
                        style={inputStyle}
                        placeholder="e.g. 5000"
                      />
                    </div>
                  )}
                  {dr.artwork_link && (
                    <div className="md:col-span-2">
                      <label htmlFor="artwork-link" className={labelClass} style={labelStyle}>
                        Custom artwork link
                      </label>
                      <input
                        id="artwork-link"
                        type="url"
                        pattern="https?://.+"
                        value={artworkLink}
                        onChange={(e) => setArtworkLink(e.target.value)}
                        className={inputClass}
                        style={inputStyle}
                        placeholder="https://... (Dropbox, WeTransfer, Google Drive, Box)"
                      />
                      <p className="text-xs mt-1" style={{ color: design.colors.textLight, fontFamily: design.fonts.bodyFont }}>
                        Share a link to your artwork files. No file upload needed.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Shipping Address - conditional on address toggle */}
            {dr.address && (
              <div className="border p-6" style={{ borderColor: design.colors.border, borderRadius: `${design.style.cornerRadius}px` }}>
                <h2 className="text-2xl font-bold mb-4" style={{ color: design.colors.primary, fontFamily: design.fonts.titleFont }}>
                  Shipping Address
                </h2>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-sm font-semibold mb-2" style={{ color: design.colors.text, fontFamily: design.fonts.bodyFont }}>
                        Address
                      </label>
                      <input
                        type="text"
                        required
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        className="w-full px-4 py-2 border focus:outline-none focus:ring-2"
                        style={{ borderColor: design.colors.border, borderRadius: `${design.style.cornerRadius}px`, fontFamily: design.fonts.bodyFont }}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold mb-2" style={{ color: design.colors.text, fontFamily: design.fonts.bodyFont }}>
                        Apt, suite, etc. (optional)
                      </label>
                      <input
                        type="text"
                        value={apt}
                        onChange={(e) => setApt(e.target.value)}
                        className="w-full px-4 py-2 border focus:outline-none focus:ring-2"
                        style={{ borderColor: design.colors.border, borderRadius: `${design.style.cornerRadius}px`, fontFamily: design.fonts.bodyFont }}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold mb-2" style={{ color: design.colors.text, fontFamily: design.fonts.bodyFont }}>
                      City
                    </label>
                    <input
                      type="text"
                      required
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="w-full px-4 py-2 border focus:outline-none focus:ring-2"
                      style={{ borderColor: design.colors.border, borderRadius: `${design.style.cornerRadius}px`, fontFamily: design.fonts.bodyFont }}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-semibold mb-2" style={{ color: design.colors.text, fontFamily: design.fonts.bodyFont }}>
                        Country
                      </label>
                      <input
                        type="text"
                        required
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
                        className="w-full px-4 py-2 border focus:outline-none focus:ring-2"
                        style={{ borderColor: design.colors.border, borderRadius: `${design.style.cornerRadius}px`, fontFamily: design.fonts.bodyFont }}
                        placeholder="United States"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold mb-2" style={{ color: design.colors.text, fontFamily: design.fonts.bodyFont }}>
                        State
                      </label>
                      <input
                        type="text"
                        required
                        value={province}
                        onChange={(e) => setProvince(e.target.value)}
                        className="w-full px-4 py-2 border focus:outline-none focus:ring-2"
                        style={{ borderColor: design.colors.border, borderRadius: `${design.style.cornerRadius}px`, fontFamily: design.fonts.bodyFont }}
                        placeholder="NY"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold mb-2" style={{ color: design.colors.text, fontFamily: design.fonts.bodyFont }}>
                        ZIP code
                      </label>
                      <input
                        type="text"
                        required
                        value={postalCode}
                        onChange={(e) => setPostalCode(e.target.value)}
                        className="w-full px-4 py-2 border focus:outline-none focus:ring-2"
                        style={{ borderColor: design.colors.border, borderRadius: `${design.style.cornerRadius}px`, fontFamily: design.fonts.bodyFont }}
                        placeholder="10001"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Billing Address - conditional on billing_address toggle */}
            {dr.billing_address && (
              <div className="border p-6" style={sectionStyle}>
                <h2 className="text-2xl font-bold mb-4" style={headingStyle}>
                  Billing Address
                </h2>
                {dr.address && (
                  <label className="flex items-center gap-2 mb-4 cursor-pointer" style={labelStyle}>
                    <input
                      type="checkbox"
                      checked={billingSameAsShipping}
                      onChange={(e) => setBillingSameAsShipping(e.target.checked)}
                    />
                    <span className="text-sm">Same as shipping address</span>
                  </label>
                )}
                {(!billingSameAsShipping || !dr.address) && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="md:col-span-2">
                        <label htmlFor="billing-address" className={labelClass} style={labelStyle}>Address</label>
                        <input id="billing-address" type="text" required value={billingAddress} onChange={(e) => setBillingAddress(e.target.value)} className={inputClass} style={inputStyle} />
                      </div>
                      <div>
                        <label htmlFor="billing-apt" className={labelClass} style={labelStyle}>Apt, suite, etc. (optional)</label>
                        <input id="billing-apt" type="text" value={billingApt} onChange={(e) => setBillingApt(e.target.value)} className={inputClass} style={inputStyle} />
                      </div>
                    </div>
                    <div>
                      <label htmlFor="billing-city" className={labelClass} style={labelStyle}>City</label>
                      <input id="billing-city" type="text" required value={billingCity} onChange={(e) => setBillingCity(e.target.value)} className={inputClass} style={inputStyle} />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label htmlFor="billing-country" className={labelClass} style={labelStyle}>Country</label>
                        <input id="billing-country" type="text" required value={billingCountry} onChange={(e) => setBillingCountry(e.target.value)} className={inputClass} style={inputStyle} />
                      </div>
                      <div>
                        <label htmlFor="billing-province" className={labelClass} style={labelStyle}>State / Region</label>
                        <input id="billing-province" type="text" value={billingProvince} onChange={(e) => setBillingProvince(e.target.value)} className={inputClass} style={inputStyle} />
                      </div>
                      <div>
                        <label htmlFor="billing-postal" className={labelClass} style={labelStyle}>Postal code</label>
                        <input id="billing-postal" type="text" required value={billingPostalCode} onChange={(e) => setBillingPostalCode(e.target.value)} className={inputClass} style={inputStyle} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Hotel Selection - conditional on hotel_list toggle */}
            {dr.hotel_list && (
              <div className="border p-6" style={{ borderColor: design.colors.border, borderRadius: `${design.style.cornerRadius}px` }}>
                <h2 className="text-2xl font-bold mb-4" style={{ color: design.colors.primary, fontFamily: design.fonts.titleFont }}>
                  Hotel Selection
                </h2>
                <div>
                  <label className="block text-sm font-semibold mb-2" style={{ color: design.colors.text, fontFamily: design.fonts.bodyFont }}>
                    {presets.hotelList.length > 0 ? 'Select your hotel' : 'Enter your hotel'}
                  </label>
                  {presets.hotelList.length > 0 ? (
                    <select
                      required
                      value={hotelSelection}
                      onChange={(e) => setHotelSelection(e.target.value)}
                      className="w-full px-4 py-2 border focus:outline-none focus:ring-2 bg-white"
                      style={{ borderColor: design.colors.border, borderRadius: `${design.style.cornerRadius}px`, fontFamily: design.fonts.bodyFont }}
                    >
                      <option value="">-- Select a hotel --</option>
                      {presets.hotelList.map((hotel, index) => (
                        <option key={index} value={hotel}>
                          {hotel}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      required
                      value={hotelSelection}
                      onChange={(e) => setHotelSelection(e.target.value)}
                      className="w-full px-4 py-2 border focus:outline-none focus:ring-2"
                      style={{ borderColor: design.colors.border, borderRadius: `${design.style.cornerRadius}px`, fontFamily: design.fonts.bodyFont }}
                      placeholder="Enter your hotel name"
                    />
                  )}
                </div>
              </div>
            )}

            {/* Purchase Order - shown only for PO shop type */}
            {presets.shopType === 'po' && (
              <div className="border p-6" style={{ borderColor: design.colors.border, borderRadius: `${design.style.cornerRadius}px` }}>
                <h2 className="text-2xl font-bold mb-4" style={{ color: design.colors.primary, fontFamily: design.fonts.titleFont }}>
                  Purchase Order
                </h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold mb-2" style={{ color: design.colors.text, fontFamily: design.fonts.bodyFont }}>
                      PO Number *
                    </label>
                    <input
                      type="text"
                      required
                      value={poNumber}
                      onChange={(e) => setPoNumber(e.target.value)}
                      className="w-full px-4 py-2 border focus:outline-none focus:ring-2"
                      style={{ borderColor: design.colors.border, borderRadius: `${design.style.cornerRadius}px`, fontFamily: design.fonts.bodyFont }}
                      placeholder="Enter your Purchase Order number"
                    />
                  </div>
                  {attachedItems.length > 0 ? (
                    <div className="text-sm px-3 py-2 rounded" style={{ backgroundColor: `${design.colors.success}15`, color: design.colors.success, fontFamily: design.fonts.bodyFont }}>
                      PO document attached via {attachedItems.map(item => `${item.productName} (${item.attachment!.filename})`).join(', ')}. No separate upload needed.
                    </div>
                  ) : (
                  <div>
                    <label className="block text-sm font-semibold mb-2" style={{ color: design.colors.text, fontFamily: design.fonts.bodyFont }}>
                      Upload PO Document *
                    </label>
                    <input
                      ref={poFileRef}
                      type="file"
                      required
                      accept=".pdf,.txt,.doc,.docx,application/pdf,text/plain,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      onChange={(e) => setPoFile(e.target.files?.[0] || null)}
                      className="w-full px-4 py-2 border focus:outline-none focus:ring-2"
                      style={{ borderColor: design.colors.border, borderRadius: `${design.style.cornerRadius}px`, fontFamily: design.fonts.bodyFont }}
                    />
                    <p className="text-xs mt-1" style={{ color: design.colors.textLight, fontFamily: design.fonts.bodyFont }}>
                      Accepted formats: PDF, TXT, Word (.doc/.docx)
                    </p>
                  </div>
                  )}
                  {poFile && attachedItems.length === 0 && (
                    <div className="flex items-center gap-2 text-sm px-3 py-2 rounded" style={{ backgroundColor: `${design.colors.success}15`, color: design.colors.success }}>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>{poFile.name} ({(poFile.size / 1024).toFixed(1)} KB)</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Stripe placeholder - shown only for stripe shop type */}
            {presets.shopType === 'stripe' && (
              <div className="border p-6" style={{ borderColor: design.colors.border, borderRadius: `${design.style.cornerRadius}px` }}>
                <h2 className="text-2xl font-bold mb-4" style={{ color: design.colors.primary, fontFamily: design.fonts.titleFont }}>
                  Payment
                </h2>
                <div className="text-center py-8" style={{ color: design.colors.textLight, fontFamily: design.fonts.bodyFont }}>
                  <p className="text-lg font-semibold mb-2">Stripe Payment Integration</p>
                  <p>Coming soon. This shop is not yet configured for payments.</p>
                </div>
              </div>
            )}

            {/* Freight Options - conditional on shipping_handler toggle */}
            {dr.shipping_handler && (
              <div className="border p-6" style={{ borderColor: design.colors.border, borderRadius: `${design.style.cornerRadius}px` }}>
                <h2 className="text-2xl font-bold mb-4" style={{ color: design.colors.primary, fontFamily: design.fonts.titleFont }}>
                  Freight Options
                </h2>

                <div className="space-y-4">
                  <label className="flex items-start space-x-3 cursor-pointer">
                    <input
                      type="radio"
                      name="freight"
                      value="lr-paris"
                      checked={freightOption === 'lr-paris'}
                      onChange={(e) => setFreightOption(e.target.value as 'lr-paris')}
                      className="mt-1"
                    />
                    <div>
                      <div className="font-semibold" style={{ color: design.colors.text, fontFamily: design.fonts.bodyFont }}>
                        Use LR Paris freight forwarder
                      </div>
                      <div className="text-sm" style={{ color: design.colors.textLight, fontFamily: design.fonts.bodyFont }}>
                        We&apos;ll arrange shipping through our partner LR Paris
                      </div>
                    </div>
                  </label>

                  <label className="flex items-start space-x-3 cursor-pointer">
                    <input
                      type="radio"
                      name="freight"
                      value="own"
                      checked={freightOption === 'own'}
                      onChange={(e) => setFreightOption(e.target.value as 'own')}
                      className="mt-1"
                    />
                    <div>
                      <div className="font-semibold" style={{ color: design.colors.text, fontFamily: design.fonts.bodyFont }}>
                        Use my freight forwarder
                      </div>
                      <div className="text-sm" style={{ color: design.colors.textLight, fontFamily: design.fonts.bodyFont }}>
                        Provide your freight forwarder details below
                      </div>
                    </div>
                  </label>

                  {freightOption === 'own' && (
                    <div className="ml-7 mt-4 space-y-4 border-l-2 pl-4" style={{ borderColor: design.colors.border }}>
                      <div>
                        <label className="block text-sm font-semibold mb-2" style={{ color: design.colors.text, fontFamily: design.fonts.bodyFont }}>
                          Freight Company Name *
                        </label>
                        <input
                          type="text"
                          required
                          value={freightCompany}
                          onChange={(e) => setFreightCompany(e.target.value)}
                          className="w-full px-4 py-2 border focus:outline-none focus:ring-2"
                          style={{ borderColor: design.colors.border, borderRadius: `${design.style.cornerRadius}px`, fontFamily: design.fonts.bodyFont }}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold mb-2" style={{ color: design.colors.text, fontFamily: design.fonts.bodyFont }}>
                          Account Number *
                        </label>
                        <input
                          type="text"
                          required
                          value={freightAccount}
                          onChange={(e) => setFreightAccount(e.target.value)}
                          className="w-full px-4 py-2 border focus:outline-none focus:ring-2"
                          style={{ borderColor: design.colors.border, borderRadius: `${design.style.cornerRadius}px`, fontFamily: design.fonts.bodyFont }}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold mb-2" style={{ color: design.colors.text, fontFamily: design.fonts.bodyFont }}>
                          Contact Information *
                        </label>
                        <input
                          type="text"
                          required
                          value={freightContact}
                          onChange={(e) => setFreightContact(e.target.value)}
                          className="w-full px-4 py-2 border focus:outline-none focus:ring-2"
                          style={{ borderColor: design.colors.border, borderRadius: `${design.style.cornerRadius}px`, fontFamily: design.fonts.bodyFont }}
                          placeholder="Phone and/or email"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Order Notes - conditional on extra_notes toggle */}
            {dr.extra_notes && (
              <div className="border p-6" style={{ borderColor: design.colors.border, borderRadius: `${design.style.cornerRadius}px` }}>
                <h2 className="text-2xl font-bold mb-4" style={{ color: design.colors.primary, fontFamily: design.fonts.titleFont }}>
                  Order Notes
                </h2>
                <textarea
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  rows={4}
                  className="w-full px-4 py-2 border focus:outline-none focus:ring-2"
                  style={{ borderColor: design.colors.border, borderRadius: `${design.style.cornerRadius}px`, fontFamily: design.fonts.bodyFont }}
                  placeholder="Any special instructions or notes for this order (optional)"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting || presets.shopType === 'stripe'}
              className="w-full py-4 text-white text-lg font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
              style={{ backgroundColor: design.colors.secondary, borderRadius: `${design.style.cornerRadius}px`, fontFamily: design.fonts.bodyFont }}
            >
              {isSubmitting
                ? 'Submitting Order...'
                : presets.shopType === 'po'
                  ? 'Submit Order with PO'
                  : presets.shopType === 'stripe'
                    ? 'Payment Not Yet Available'
                    : 'Submit Order'}
            </button>
          </form>
        </div>

        {/* Order Summary */}
        <div>
          <div
            className="border p-6 sticky top-24"
            style={{ borderColor: design.colors.border, borderRadius: `${design.style.cornerRadius}px` }}
          >
            <h2 className="text-2xl font-bold mb-6" style={{ color: design.colors.primary, fontFamily: design.fonts.titleFont }}>
              Order Summary
            </h2>

            {presets.shopType !== 'free' && (
              <div className="mb-4 px-3 py-2 rounded text-xs font-semibold uppercase tracking-wide"
                style={{
                  backgroundColor: presets.shopType === 'po' ? `${design.colors.accent}15` : `${design.colors.secondary}15`,
                  color: presets.shopType === 'po' ? design.colors.accent : design.colors.secondary,
                }}>
                {presets.shopType === 'po' ? 'Purchase Order Required' : 'Stripe Payment (Coming Soon)'}
              </div>
            )}

            <div className="space-y-3 mb-6">
              {cart.items.map((item) => (
                <div key={item.productId} className="pb-3 border-b" style={{ borderColor: design.colors.border }}>
                  <div className="font-semibold mb-1" style={{ color: design.colors.text, fontFamily: design.fonts.titleFont }}>
                    {item.productName}
                  </div>
                  <div className="text-sm flex justify-between" style={{ color: design.colors.textLight, fontFamily: design.fonts.bodyFont }}>
                    {pricing.hidePrices ? (
                      <span>{item.quantity} box{item.quantity > 1 ? 'es' : ''}</span>
                    ) : (
                      <>
                        <span>{item.quantity} box{item.quantity > 1 ? 'es' : ''} × {formatMoney(item.boxCost, pricing.currency)}</span>
                        <span>{formatMoney(item.boxCost * item.quantity, pricing.currency)}</span>
                      </>
                    )}
                  </div>
                  {item.attachment && (
                    <div className="text-xs" style={{ color: design.colors.success, fontFamily: design.fonts.bodyFont }}>
                      Attached: {item.attachment.filename}
                    </div>
                  )}
                  <div className="text-xs" style={{ color: design.colors.textLight, fontFamily: design.fonts.bodyFont }}>
                    {item.quantity * item.unitsPerBox} total units
                  </div>
                </div>
              ))}
            </div>

            {!pricing.hidePrices && (
              <div className="border-t pt-4" style={{ borderColor: design.colors.border }}>
                <div className="flex justify-between items-center">
                  <span className="text-xl font-bold" style={{ color: design.colors.primary, fontFamily: design.fonts.titleFont }}>
                    Total:
                  </span>
                  <span className="text-3xl font-bold" style={{ color: design.colors.secondary, fontFamily: design.fonts.titleFont }}>
                    {formatMoney(cart.total, pricing.currency)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
