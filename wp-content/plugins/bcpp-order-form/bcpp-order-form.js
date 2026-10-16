/**
 * Bucks County Photo Printing — Order Form Client Logic
 * Handles real-time recalculation, volume discounts, promo codes,
 * and exact layout matching the target mockup.
 */

( function ( $ ) {
	'use strict';

	var settings = window.bcppAjax || {};
	var promoRate = 0;
	var promoAmount = 0;
	var promoType = 'percent';
	var promoCode = '';
	var promoValid = false;
	var promoLookup = null;

	var stripeInstance = null;
	var stripeElements = null;
	var stripeCardElement = null;
	var stripeMounted = false;
	var isOrderCardComplete = false;
	var orderCardErrorMsg = '';

	var stripeGiftCardElement = null;
	var stripeGiftMounted = false;
	var isGiftCardComplete = false;
	var giftCardErrorMsg = '';

	var isSubmittingPayment = false;

	var TAX_RATE = 0.06;

	var TIERS = [
		{ min: 250, rate: 0.15 },
		{ min: 100, rate: 0.10 }
	];

	function toNumber( val ) {
		if ( typeof val === 'number' ) {
			return isNaN( val ) ? 0 : val;
		}
		if ( ! val ) {
			return 0;
		}
		var clean = String( val ).replace( /[^0-9.-]+/g, '' );
		var num = parseFloat( clean );
		return isNaN( num ) ? 0 : num;
	}

	function money( val ) {
		var num = toNumber( val );
		return '$ ' + num.toFixed( 2 );
	}

	function priceFromLabel( text ) {
		if ( ! text ) {
			return 0;
		}
		var match = String( text ).match( /\$\s*([0-9]+(?:\.[0-9]{2})?)/ );
		return match ? parseFloat( match[ 1 ] ) : 0;
	}

	function buildPaymentModule( context ) {
		var isGift = ( context === 'gift' );
		var prefix = isGift ? 'bcpp_gift_' : 'bcpp_';
		var cardElId = isGift ? 'bcpp_gift_card_element' : 'bcpp_card_element';
		var cardErrorsId = isGift ? 'bcpp_gift_card_errors' : 'bcpp_card_errors';
		var totalClass = isGift ? 'bcpp-gift-live-total' : 'bcpp-live-total-display';

		var venmoCfg = ( settings && settings.venmo ) ? settings.venmo : { enabled: true, handle: '@bill-nyman-photo', name: 'William Nyman', qrUrl: '' };
		var zelleCfg = ( settings && settings.zelle ) ? settings.zelle : { enabled: true, phone: '445-293-1175', name: 'BUCKS PHOTO', memo: 'bucks-photo', qrUrl: '' };
		var paymentNote = ( settings && typeof settings.paymentNote === 'string' ) ? settings.paymentNote : 'Payment Note: For Venmo and Zelle payments specifically, please submit payment and then after your payment is sent, then click the blue submit button below to send your full order to Bucks Photo.';

		var isCardEnabled = !! ( settings && settings.stripeEnabled );
		var isVenmoEnabled = !! venmoCfg.enabled;
		var isZelleEnabled = !! zelleCfg.enabled;

		var defaultMethod = isCardEnabled ? 'credit_card' : ( isVenmoEnabled ? 'venmo' : ( isZelleEnabled ? 'zelle' : 'credit_card' ) );

		var noteHtml = '';
		if ( paymentNote && $.trim( paymentNote ) !== '' && ( isVenmoEnabled || isZelleEnabled ) ) {
			noteHtml = '<div class="bcpp-payment-note">' + paymentNote + '</div>';
		}

		var tabsHtml = '<div class="bcpp-payment-tabs-header">' +
			'<span class="bcpp-payment-tabs-label">Select Payment Method:</span>' +
			'<div class="bcpp-payment-tabs">';

		if ( isCardEnabled ) {
			tabsHtml += '<button type="button" class="bcpp-payment-tab' + ( defaultMethod === 'credit_card' ? ' active' : '' ) + '" data-method="credit_card">' +
				'<span class="bcpp-tab-icon">💳</span>' +
				'<span class="bcpp-tab-title">Credit / Debit Card</span>' +
			'</button>';
		}

		if ( isVenmoEnabled ) {
			tabsHtml += '<button type="button" class="bcpp-payment-tab' + ( defaultMethod === 'venmo' ? ' active' : '' ) + '" data-method="venmo">' +
				'<span class="bcpp-tab-icon" style="color: #008CFF; font-weight: 900; font-style: italic; font-family: sans-serif;">V</span>' +
				'<span class="bcpp-tab-title">Venmo</span>' +
			'</button>';
		}

		if ( isZelleEnabled ) {
			tabsHtml += '<button type="button" class="bcpp-payment-tab' + ( defaultMethod === 'zelle' ? ' active' : '' ) + '" data-method="zelle">' +
				'<span class="bcpp-tab-icon" style="color: #7414CA; font-weight: 900; font-family: sans-serif;">Ż</span>' +
				'<span class="bcpp-tab-title">Zelle</span>' +
			'</button>';
		}

		tabsHtml += '</div></div>';

		// Hidden input to post the chosen method
		var hiddenInputHtml = '<input type="hidden" name="bcpp_payment_method" class="bcpp-payment-method-input" value="' + defaultMethod + '" />';

		// Panel 1: Card
		var cardPanelHtml = '<div class="bcpp-payment-panel bcpp-panel-credit_card" style="' + ( defaultMethod === 'credit_card' ? '' : 'display:none;' ) + '">' +
			'<div class="bcpp-stripe-payment-box">' +
				'<div class="bcpp-stripe-header">' +
					'<div class="bcpp-stripe-title">' +
						'<svg class="bcpp-lock-icon" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>' +
						'<span>Credit or Debit Card</span>' +
					'</div>' +
					'<div class="bcpp-card-icons">' +
						'<span class="bcpp-badge-card">Visa</span>' +
						'<span class="bcpp-badge-card">Mastercard</span>' +
						'<span class="bcpp-badge-card">Amex</span>' +
						'<span class="bcpp-badge-card">Discover</span>' +
					'</div>' +
				'</div>' +
				'<div id="' + cardElId + '" class="bcpp-card-element-container"></div>' +
				'<div id="' + cardErrorsId + '" class="bcpp-card-errors" role="alert" style="display:none;"></div>' +
				'<div class="bcpp-stripe-footer">' +
					'<span>🔒 256-Bit SSL Encrypted &amp; Secured by Stripe</span>' +
				'</div>' +
			'</div>' +
		'</div>';

		// Panel 2: Venmo
		var venmoQr = venmoCfg.qrUrl || '';
		var venmoHandle = venmoCfg.handle || '@bill-nyman-photo';
		var venmoName = venmoCfg.name || 'William Nyman';

		var venmoPanelHtml = '<div class="bcpp-payment-panel bcpp-panel-venmo" style="' + ( defaultMethod === 'venmo' ? '' : 'display:none;' ) + '">' +
			'<div class="bcpp-direct-payment-box bcpp-venmo-box">' +
				'<div class="bcpp-direct-header bcpp-venmo-header">' +
					'<div class="bcpp-direct-brand">' +
						'<span class="bcpp-direct-logo-text bcpp-venmo-logo">venmo</span>' +
						'<span class="bcpp-direct-subtitle">Pay with Venmo</span>' +
					'</div>' +
					'<div class="bcpp-direct-amount-badge">' +
						'<span>Amount to send:</span>' +
						'<strong class="' + totalClass + '">$ 0.00</strong>' +
					'</div>' +
				'</div>' +
				'<div class="bcpp-direct-content">' +
					'<div class="bcpp-qr-wrapper">' +
						'<img src="' + venmoQr + '" alt="Venmo QR Code" class="bcpp-qr-image" />' +
						'<span class="bcpp-qr-caption">Scan with camera or Venmo app</span>' +
					'</div>' +
					'<div class="bcpp-direct-details">' +
						'<div class="bcpp-detail-item">' +
							'<span class="bcpp-detail-lbl">Venmo Username:</span>' +
							'<span class="bcpp-detail-val bcpp-copyable" data-copy="' + venmoHandle + '">' +
								'<strong>' + venmoHandle + '</strong>' +
								'<button type="button" class="bcpp-copy-btn" title="Copy to clipboard">📋 Copy</button>' +
							'</span>' +
						'</div>' +
						'<div class="bcpp-detail-item">' +
							'<span class="bcpp-detail-lbl">Account Name:</span>' +
							'<span class="bcpp-detail-val">' + venmoName + '</span>' +
						'</div>' +
						'<div class="bcpp-instruction-steps">' +
							'<ol>' +
								'<li>Scan the QR code above or search <strong>' + venmoHandle + '</strong> in Venmo.</li>' +
								'<li>Send payment for your exact order total (<strong class="' + totalClass + '">$ 0.00</strong>).</li>' +
								'<li><strong style="color: #008CFF;">Important:</strong> Put your <strong>Full Name</strong> in the payment memo so we can match your order!</li>' +
							'</ol>' +
						'</div>' +
						'<div class="bcpp-sender-field">' +
							'<label for="' + prefix + 'venmo_sender">Your Venmo Handle (Optional):</label>' +
							'<input type="text" name="bcpp_venmo_sender" id="' + prefix + 'venmo_sender" placeholder="@your-username" class="bcpp-manual-input" />' +
						'</div>' +
					'</div>' +
				'</div>' +
				'<div class="bcpp-direct-footer">' +
					'<span>✓ Submit below when ready. Your order will be placed immediately and processed upon payment receipt.</span>' +
				'</div>' +
			'</div>' +
		'</div>';

		// Panel 3: Zelle
		var zelleQr = zelleCfg.qrUrl || '';
		var zellePhone = zelleCfg.phone || '445-293-1175';
		var zelleName = zelleCfg.name || 'BUCKS PHOTO';
		var zelleMemo = zelleCfg.memo || 'bucks-photo';

		var zellePanelHtml = '<div class="bcpp-payment-panel bcpp-panel-zelle" style="' + ( defaultMethod === 'zelle' ? '' : 'display:none;' ) + '">' +
			'<div class="bcpp-direct-payment-box bcpp-zelle-box">' +
				'<div class="bcpp-direct-header bcpp-zelle-header">' +
					'<div class="bcpp-direct-brand">' +
						'<span class="bcpp-direct-logo-text bcpp-zelle-logo">Żelle<sup>®</sup></span>' +
						'<span class="bcpp-direct-subtitle">Pay with Zelle</span>' +
					'</div>' +
					'<div class="bcpp-direct-amount-badge">' +
						'<span>Amount to send:</span>' +
						'<strong class="' + totalClass + '">$ 0.00</strong>' +
					'</div>' +
				'</div>' +
				'<div class="bcpp-direct-content">' +
					'<div class="bcpp-qr-wrapper">' +
						'<img src="' + zelleQr + '" alt="Zelle QR Code" class="bcpp-qr-image" />' +
						'<span class="bcpp-qr-caption">Scan in your banking app</span>' +
					'</div>' +
					'<div class="bcpp-direct-details">' +
						'<div class="bcpp-detail-item">' +
							'<span class="bcpp-detail-lbl">Zelle Phone / Email:</span>' +
							'<span class="bcpp-detail-val bcpp-copyable" data-copy="' + zellePhone + '">' +
								'<strong>' + zellePhone + '</strong>' +
								'<button type="button" class="bcpp-copy-btn" title="Copy to clipboard">📋 Copy</button>' +
							'</span>' +
						'</div>' +
						'<div class="bcpp-detail-item">' +
							'<span class="bcpp-detail-lbl">Registered Business:</span>' +
							'<span class="bcpp-detail-val">' + zelleName + ' <em>(' + zelleMemo + ')</em></span>' +
						'</div>' +
						'<div class="bcpp-instruction-steps">' +
							'<ol>' +
								'<li>Open your banking app, go to <strong>Zelle</strong>, and send to <strong>' + zellePhone + '</strong>.</li>' +
								'<li>Send payment for your exact order total (<strong class="' + totalClass + '">$ 0.00</strong>).</li>' +
								'<li><strong style="color: #7414CA;">Important:</strong> Put your <strong>Full Name</strong> in the Zelle memo so we can link your transfer!</li>' +
							'</ol>' +
						'</div>' +
						'<div class="bcpp-sender-field">' +
							'<label for="' + prefix + 'zelle_sender">Your Zelle Name / Phone (Optional):</label>' +
							'<input type="text" name="bcpp_zelle_sender" id="' + prefix + 'zelle_sender" placeholder="e.g. John Doe / 215-xxx-xxxx" class="bcpp-manual-input" />' +
						'</div>' +
					'</div>' +
				'</div>' +
				'<div class="bcpp-direct-footer">' +
					'<span>✓ Submit below when ready. Your order will be placed immediately and processed upon payment receipt.</span>' +
				'</div>' +
			'</div>' +
		'</div>';

		return '<div class="bcpp-payment-module" id="' + prefix + 'payment_module">' +
			noteHtml +
			tabsHtml +
			hiddenInputHtml +
			cardPanelHtml +
			venmoPanelHtml +
			zellePanelHtml +
		'</div>';
	}

	/**
	 * Setup form structure, titles, section dividers, column headings, and layout containers for Order Form.
	 */
	function setupFormStructure() {
		var $form = $( '#form_bcpp-order-form, .bcpp-order-form, #frm_form_16_container form' ).first();
		if ( ! $form.length || $form.data( 'bcpp-initialized' ) ) {
			return;
		}
		$form.data( 'bcpp-initialized', true );

		// Remove Formidable default h3 headings to prevent spacing gap
		$( '.frm_section_heading > h3, h3.frm_section_spacing, h3.frm_pos_top, .frm_section_heading h3' ).remove();

		// 1. Top Order Form Header & Notice
		if ( ! $( '#order_form_abc' ).length ) {
			$form.prepend(
				'<div class="bcpp-header-title"><h1 id="order_form_abc">Order Form</h1></div>' +
				'<div class="bcpp-section-title" id="your_information">Your Information</div>' +
				'<div class="bcpp-div-border"></div>'
			);
		}

		// 2. Banner, Title & Divider before Premium Papers
		var $premiumSec = $( '.bcpp-premium' ).first();
		if ( $premiumSec.length ) {
			var premiumDesc = $.trim( $premiumSec.find( '.frm_description' ).first().text() ) || 'enhanced matte, premium luster, premium glossy, matte card, gloss card';
			if ( ! $( '#premium_papers' ).length ) {
				$(
					'<div class="bcpp-instruction-banner">' +
						'Click <span class="bcpp-inline-icon">+</span> or <span class="bcpp-inline-icon">–</span> to add or delete entry rows below. ' +
						'Upload files using <a href="https://www.wetransfer.com" target="_blank" rel="noopener noreferrer">www.wetransfer.com</a> to bill@bucksphoto.com' +
					'</div>' +
					'<div class="bcpp-section-title" id="premium_papers">Premium Papers <span class="desktoptext">' + premiumDesc + '</span></div>' +
					'<div class="bcpp-div-border"></div>'
				).insertBefore( $premiumSec );
			}
			var $firstPremRepeat = $premiumSec.find( '.frm_repeat_sec, .frm_repeat_both' ).first();
			if ( $firstPremRepeat.length && ! $( '#bcpp-premium-labels' ).length ) {
				$(
					'<div class="bcpp-labels-section" id="bcpp-premium-labels">' +
						'<div class="bcpp-lbl-file"><h4>File Name</h4></div>' +
						'<div class="bcpp-lbl-border"><h4>Border</h4></div>' +
						'<div class="bcpp-lbl-size"><h4>Print Size</h4></div>' +
						'<div class="bcpp-lbl-paper"><h4>Premium Paper</h4></div>' +
						'<div class="bcpp-lbl-amt"><h4>Amt.</h4></div>' +
						'<div class="bcpp-lbl-sub"><h4>Sub Total</h4></div>' +
					'</div>'
				).insertBefore( $firstPremRepeat );
			}
		}

		// 3. Specialty Papers Header and Labels
		var $specialtySec = $( '.bcpp-specialty' ).first();
		if ( $specialtySec.length ) {
			var specialtyDesc = $.trim( $specialtySec.find( '.frm_description' ).first().text() ) || 'hahnemuhle photo rag, moab metallic pearl, canvas';
			if ( ! $( '#specialty_papers' ).length ) {
				$(
					'<div class="bcpp-section-title" id="specialty_papers">Specialty Papers <span class="desktoptext">' + specialtyDesc + '</span></div>' +
					'<div class="bcpp-div-border"></div>'
				).insertBefore( $specialtySec );
			}
			var $firstSpecRepeat = $specialtySec.find( '.frm_repeat_sec, .frm_repeat_both' ).first();
			if ( $firstSpecRepeat.length && ! $( '#bcpp-specialty-labels' ).length ) {
				$(
					'<div class="bcpp-labels-section" id="bcpp-specialty-labels">' +
						'<div class="bcpp-lbl-file"><h4>File Name</h4></div>' +
						'<div class="bcpp-lbl-border"><h4>Border</h4></div>' +
						'<div class="bcpp-lbl-size"><h4>Print Size</h4></div>' +
						'<div class="bcpp-lbl-paper"><h4>Specialty Paper</h4></div>' +
						'<div class="bcpp-lbl-amt"><h4>Amt.</h4></div>' +
						'<div class="bcpp-lbl-sub"><h4>Sub Total</h4></div>' +
					'</div>'
				).insertBefore( $firstSpecRepeat );
			}
		}

		// 4. Additional Services Header and Labels
		var $addlSec = $( '.bcpp-additional' ).first();
		if ( $addlSec.length ) {
			if ( ! $( '#additional_services' ).length ) {
				$(
					'<div class="bcpp-section-title" id="additional_services">Additional Services <span class="desktoptext">scanning, retouching, custom sizes, shipping</span></div>' +
					'<div class="bcpp-div-border"></div>'
				).insertBefore( $addlSec );
			}
			var $firstAddlRepeat = $addlSec.find( '.frm_repeat_sec, .frm_repeat_both' ).first();
			if ( $firstAddlRepeat.length && ! $( '#bcpp-addl-labels' ).length ) {
				$(
					'<div class="bcpp-addl-labels" id="bcpp-addl-labels">' +
						'<div class="bcpp-lbl-service"><h4>Service</h4></div>' +
						'<div class="bcpp-lbl-notes"><h4>Notes</h4></div>' +
						'<div class="bcpp-lbl-addsub"><h4>Sub Total</h4></div>' +
					'</div>'
				).insertBefore( $firstAddlRepeat );
			}
		}

		ensureRowLabels();

		// 5. Wrap Bottom Section
		var $bottomFields = $form.find( '.bcpp-promo, .bcpp-subtotal, .bcpp-discount, .bcpp-discount-label, .bcpp-taxexempt, .bcpp-tax, .bcpp-total, #frm_field_71_container, #frm_field_72_container, #frm_field_73_container, #frm_field_74_container, #frm_field_75_container, #frm_field_76_container, #frm_field_78_container' );
		var $messageArea = $( '.bcpp-message' ).first();
		if ( $messageArea.length && ! $( '.bcpp-bottom-section' ).length ) {
			var $bottomSection = $( '<div class="bcpp-bottom-section"></div>' );
			$messageArea.before( $bottomSection );
			$bottomSection.append( $messageArea );

			// Build the Total Cost block
			var $totalsBox = $(
				'<div class="bcpp-totals-box bcpp_total_cost">' +
					'<div class="bcpp-courtesy-banner courtesy">' +
						'Subtotals of $100 or more receive a courtesy 10% off<br />' +
						'Subtotals of $250 or more receive a courtesy 15% off' +
					'</div>' +
					'<table class="bcpp-totals-table totals">' +
						'<tbody>' +
							'<tr>' +
								'<td class="bcpp-lbl-col sub-type"><p>Sub Total</p></td>' +
								'<td class="bcpp-val-col sub-amount" id="sub_total">' +
									'<input type="text" id="sub_total2" class="sub_total2" readonly="readonly" value="$ 0.00" />' +
								'</td>' +
							'</tr>' +
							'<tr>' +
								'<td colspan="2" class="bcpp-promo-input-cell">' +
									'<input type="text" id="promo_code1" class="promo_code1" placeholder="Promo / Gift Certificate Code" />' +
								'</td>' +
							'</tr>' +
							'<tr class="bcpp-discount-row">' +
								'<td class="bcpp-lbl-col bcpp-discount-lbl sub-type" id="discount_label_cell"><p id="discount_label_text">Discount</p></td>' +
								'<td class="bcpp-val-col bcpp-discount-val sub-amount" id="abc1">' +
									'<input type="text" id="promo_discount_display" readonly="readonly" value="" />' +
								'</td>' +
							'</tr>' +
							'<tr>' +
								'<td class="bcpp-lbl-col sub-type" colspan="2">' +
									'<div class="bcpp-tax-exempt-wrapper">' +
										'<label><input type="checkbox" id="tax_exempt_toggle" /> Tax Exempt on File</label>' +
									'</div>' +
								'</td>' +
							'</tr>' +
							'<tr>' +
								'<td class="bcpp-lbl-col sub-type"><p>6% Sales Tax</p></td>' +
								'<td class="bcpp-val-col sub-amount" id="sales_tax">' +
									'<input type="text" id="sales_tax1" class="sales_tax1" readonly="readonly" value="$ 0.00" />' +
								'</td>' +
							'</tr>' +
							'<tr class="bcpp-total-divider">' +
								'<td class="bcpp-lbl-col bcpp-total-lbl sub-type upper"><p>TOTAL</p></td>' +
								'<td class="bcpp-val-col bcpp-total-val sub-amount" id="total">' +
									'<input type="text" id="total1" class="total1" readonly="readonly" value="$ 0.00" />' +
								'</td>' +
							'</tr>' +
						'</tbody>' +
					'</table>' +
					buildPaymentModule( 'order' ) +
				'</div>'
			);

			$bottomSection.append( $totalsBox );
		}

		// 7. Submit button
		var $submitContainer = $( '#frm_field_79_container, .frm_submit' ).first().closest( '.frm_form_field, .frm_submit' );
		if ( $submitContainer.length && $( '.bcpp-bottom-section' ).length ) {
			$( '.bcpp-bottom-section' ).after( $submitContainer );
		}
		var $submit = $( '.frm_button_submit' );
		if ( $submit.length ) {
			if ( ! $submit.attr( 'id' ) ) {
				$submit.attr( 'id', 'send-message' );
			}
		}
		if ( ! $( '#bcpp_submit_notice' ).length && $submitContainer.length ) {
			$submitContainer.after( '<div id="bcpp_submit_notice" class="bcpp-submit-notice" style="display: none;"></div>' );
		}

		// Initialize default row values
		$( '.bcpp-amt input' ).each( function () {
			if ( ! $( this ).val() && $( this ).val() !== '0' ) {
				$( this ).val( '0' );
			}
		} );

		$( '.bcpp-rowsub input' ).each( function () {
			if ( ! $( this ).val() ) {
				$( this ).val( '$ 0.00' );
			}
		} );

		$( '.bcpp-addsub input' ).each( function () {
			if ( ! $( this ).val() ) {
				$( this ).val( '$ 0.00' );
			}
		} );

		// Hide duplicate backend fields from frontend
		$( '.bcpp-promo, .bcpp-subtotal, .bcpp-discount, .bcpp-discount-label, .bcpp-taxexempt, .bcpp-tax, .bcpp-total, #frm_field_71_container, #frm_field_72_container, #frm_field_73_container, #frm_field_74_container, #frm_field_75_container, #frm_field_76_container, #frm_field_78_container' ).hide();

		updateRepeaterButtons();
	}

	/* ------------------------------------------------------------------ */
	/* Gift Certificates Form Setup & Structure                           */
	/* ------------------------------------------------------------------ */

	/* ------------------------------------------------------------------ */
	/* Gift Certificates Form Setup & Structure                           */
	/* ------------------------------------------------------------------ */

	function setupGiftFormStructure() {
		var $form = $( '#form_gift-certificates, form.bcpp-gift-form, #frm_form_17_container form, #frm_form_12_container form' ).first();
		if ( ! $form.length ) {
			$form = $( 'form' ).filter( function () {
				return $( this ).is( '#form_gift-certificates, .bcpp-gift-form' ) ||
				       $( this ).find( 'input[name="form_key"][value="gift-certificates"]' ).length > 0 ||
				       $( this ).find( '#field_5s2ph, #field_yc52, #field_4ngwx' ).length > 0;
			} ).first();
		}

		if ( ! $form.length || $form.data( 'bcpp-gift-initialized' ) ) {
			return;
		}
		$form.data( 'bcpp-gift-initialized', true );

		// Remove Formidable default h3 headers
		$form.find( '.frm_section_heading > h3, h3.frm_section_spacing, h3.frm_pos_top, .frm_section_heading h3, .frm_form_title' ).remove();

		// 1. Wrap "TO" section fields (5s2ph, 72xo0, mcm89) inside .bcpp-gift-to-box
		var $toFields = $form.find( '#field_5s2ph, #field_72xo0, #field_mcm89' ).closest( '.frm_form_field' );
		if ( ! $toFields.length ) {
			$toFields = $form.find( '#frm_field_146_container, #frm_field_147_container, #frm_field_148_container, #frm_field_120_container, #frm_field_121_container, #frm_field_122_container' );
		}
		if ( ! $toFields.length ) {
			$toFields = $form.find( '.frm_form_field.frm4' ).slice( 0, 3 );
		}
		if ( $toFields.length && ! $( '#bcpp_gift_to_box' ).length ) {
			var $toBox = $( '<div class="bcpp-gift-box bcpp-gift-to-box" id="bcpp_gift_to_box"><div class="bcpp-gift-tab">TO:</div></div>' );
			$toFields.first().before( $toBox );
			$toBox.append( $toFields );
		}

		// 2. Wrap "FROM" section fields (yc52, hr71e, 892jn) inside .bcpp-gift-from-box
		var $fromFields = $form.find( '#field_yc52, #field_hr71e, #field_892jn' ).closest( '.frm_form_field' );
		if ( ! $fromFields.length ) {
			$fromFields = $form.find( '#frm_field_149_container, #frm_field_150_container, #frm_field_151_container, #frm_field_123_container, #frm_field_124_container, #frm_field_125_container' );
		}
		if ( ! $fromFields.length ) {
			$fromFields = $form.find( '.frm_form_field.frm4' ).slice( 3, 6 );
		}
		if ( $fromFields.length && ! $( '#bcpp_gift_from_box' ).length ) {
			var $fromBox = $( '<div class="bcpp-gift-box bcpp-gift-from-box" id="bcpp_gift_from_box"><div class="bcpp-gift-tab">FROM:</div></div>' );
			$fromFields.first().before( $fromBox );
			$fromBox.append( $fromFields );
		}

		// 3. Payment Section & Stripe Box (before submit container)
		var $submitContainer = $form.find( '.frm_submit, .frm_final_submit, .frm_button_submit' ).first().closest( '.frm_form_field, .frm_submit' );
		if ( ! $submitContainer.length ) {
			$submitContainer = $form.find( '#frm_field_157_container, #frm_field_129_container' );
		}

		if ( ! $( '#bcpp_gift_payment_section' ).length ) {
			var $paymentBox = $(
				'<div class="bcpp-gift-payment-section" id="bcpp_gift_payment_section">' +
					'<div class="bcpp-gift-section-title" id="gift_payment_heading">Payment Information</div>' +
					'<div class="bcpp-gift-div-border"></div>' +
					'<div class="bcpp-totals-box bcpp-gift-totals-box">' +
						'<div class="bcpp-gift-summary-row">' +
							'<span class="bcpp-gift-summary-lbl">Gift Certificate Amount:</span>' +
							'<span class="bcpp-gift-summary-val" id="bcpp_gift_charge_amount">$ 0.00</span>' +
						'</div>' +
						buildPaymentModule( 'gift' ) +
					'</div>' +
				'</div>'
			);

			if ( $submitContainer.length ) {
				$paymentBox.insertBefore( $submitContainer );
			} else {
				$form.append( $paymentBox );
			}
		}

		// 4. Amount Radio Buttons Setup ($35, $50, $75, $100, $150, $200, $250, $300, $400, $500)
		var GIFT_AMOUNTS = [ 35, 50, 75, 100, 150, 200, 250, 300, 400, 500 ];
		var $amtField = $form.find( '#field_4ngwx, input[name*="[153]"], input[name*="[127]"]' );
		var $amtContainer = $amtField.closest( '.frm_form_field' );

		if ( $amtContainer.length && ! $amtContainer.find( '.bcpp-gift-amount-radios' ).length ) {
			var $nativeRadios = $amtContainer.find( 'input[type="radio"]' );
			if ( ! $nativeRadios.length ) {
				// Hide default number input so the radio buttons are used
				$amtField.css( 'display', 'none' );
				var currentVal = toNumber( $amtField.val() );

				var radiosHtml = '<div class="bcpp-gift-amount-radios" id="bcpp_gift_amount_radios">';
				$.each( GIFT_AMOUNTS, function ( idx, amt ) {
					var isChecked = ( currentVal === amt ) ? ' checked="checked"' : '';
					var activeCls = ( currentVal === amt ) ? ' is-selected' : '';
					radiosHtml += '<label class="bcpp-gift-amount-item' + activeCls + '" data-amount="' + amt + '">' +
						'<input type="radio" name="bcpp_gift_amount_radio" value="' + amt + '"' + isChecked + ' />' +
						'<span class="bcpp-amount-label">$' + amt.toFixed( 2 ) + '</span>' +
					'</label>';
				} );
				radiosHtml += '</div>';

				$amtField.after( radiosHtml );
			}
		}

		// Live amount syncing & selection handling
		function updateGiftAmount() {
			var raw = '';
			var $checkedRadio = $form.find( 'input[name="bcpp_gift_amount_radio"]:checked, input[name*="item_meta"][type="radio"]:checked' );
			if ( $checkedRadio.length ) {
				raw = $checkedRadio.val();
			} else {
				raw = $form.find( '#field_4ngwx, input[name*="[153]"], input[name*="[127]"]' ).filter( ':not([type="radio"])' ).val();
			}
			var num = toNumber( raw );
			var formatted = num > 0 ? money( num ) : '$ 0.00';
			$( '#bcpp_gift_charge_amount' ).text( formatted );
			$form.find( '.bcpp-gift-live-total' ).text( formatted );
		}

		$form.on( 'change', 'input[name="bcpp_gift_amount_radio"], input[name*="item_meta"][type="radio"]', function () {
			var val = $( this ).val();
			var num = toNumber( val );

			// Sync hidden/number input
			$form.find( '#field_4ngwx, input[name*="[153]"], input[name*="[127]"]' ).filter( ':not([type="radio"])' ).val( num > 0 ? num.toFixed( 2 ) : '' );

			// Toggle active class
			$( '.bcpp-gift-amount-item' ).removeClass( 'is-selected' );
			$( this ).closest( '.bcpp-gift-amount-item' ).addClass( 'is-selected' );

			updateGiftAmount();
		} );

		$form.on( 'input change keyup blur', '#field_4ngwx, input[type="number"], input[name*="[153]"], input[name*="[127]"]', updateGiftAmount );
		updateGiftAmount();

		if ( settings.stripeEnabled ) {
			mountStripeGiftCard();
		}
	}

	function ensureRowLabels() {
		// Ensure inner labels are removed from inside rows so labels stay cleanly outside the card border
		$( '.frm_repeat_sec, .frm_repeat_both' ).find( '.bcpp-labels-section' ).remove();
	}

	function updateRepeaterButtons() {
		// Premium, Specialty, and Additional repeaters (Row 1 has + only; Row 2+ has + and -)
		$( '.bcpp-premium, .bcpp-specialty, .bcpp-additional, [id^="frm_field_52_container"], [id^="frm_field_60_container"], [id^="frm_field_98_container"], .frm_repeat_sec_container' ).each( function () {
			var $rows = $( this ).find( '.frm_repeat_sec, .frm_repeat_both' );
			$rows.each( function ( index ) {
				if ( index === 0 ) {
					$( this ).find( '.frm_remove_form_row' ).attr( 'style', 'display: none !important;' );
					$( this ).find( '.frm_add_form_row' ).attr( 'style', 'display: inline-flex !important;' );
				} else {
					$( this ).find( '.frm_add_form_row' ).attr( 'style', 'display: inline-flex !important;' );
					$( this ).find( '.frm_remove_form_row' ).attr( 'style', 'display: inline-flex !important;' );
				}
			} );
		} );
	}

	function repriceRow( element ) {
		var $row = $( element ).closest( '.frm_repeat_sec, .frm_repeat_both' );
		if ( ! $row.length ) {
			return;
		}

		var size = $row.find( '.bcpp-size select' ).val();
		var rawQty = $row.find( '.bcpp-amt input' ).val();
		var qty = parseFloat( rawQty );

		if ( isNaN( qty ) || qty < 0 ) {
			qty = 0;
		}

		var price = priceFromLabel( size );
		var rowTotal = price * qty;
		$row.find( '.bcpp-rowsub input' ).val( money( rowTotal ) );
	}

	function volumeRate( subtotal ) {
		for ( var i = 0; i < TIERS.length; i++ ) {
			if ( subtotal >= TIERS[ i ].min ) {
				return TIERS[ i ].rate;
			}
		}
		return 0;
	}

	function recalculate() {
		var subtotal = 0;

		$( '.bcpp-rowsub input' ).each( function () {
			subtotal += toNumber( this.value );
		} );

		// Sum typed additional amounts
		$( '.bcpp-addsub input' ).each( function () {
			subtotal += toNumber( this.value );
		} );

		var autoRate = volumeRate( subtotal );
		var autoDiscount = subtotal * autoRate;
		var promoDiscount = 0;
		var promoLabel = '';

		if ( promoValid && promoCode && subtotal > 0 ) {
			if ( promoType === 'fixed' ) {
				promoDiscount = Math.min( subtotal, promoAmount );
				promoLabel = promoCode + ' Gift Certificate ' + money( promoAmount );
			} else if ( promoType === 'percent' && promoRate > 0 ) {
				promoDiscount = subtotal * promoRate;
				promoLabel = promoCode + ' Discount ' + Math.round( promoRate * 100 ) + '%';
			}
		}

		var finalDiscount = 0;
		var label = '';

		if ( promoDiscount >= autoDiscount && promoDiscount > 0 ) {
			finalDiscount = promoDiscount;
			label = promoLabel;
		} else if ( autoDiscount > 0 ) {
			finalDiscount = autoDiscount;
			label = 'Volume Discount ' + Math.round( autoRate * 100 ) + '%';
		}

		var discounted = Math.max( 0, subtotal - finalDiscount );
		var isExempt = $( '#tax_exempt_toggle' ).is( ':checked' ) || $( '.bcpp-taxexempt input[type="checkbox"]' ).is( ':checked' );
		var tax = ( isExempt || discounted <= 0 ) ? 0 : discounted * TAX_RATE;
		var total = subtotal > 0 ? ( discounted + tax ) : 0;

		// Update UI Table
		$( '#sub_total2' ).val( subtotal > 0 ? money( subtotal ) : '$ 0.00' );

		if ( finalDiscount > 0 && subtotal > 0 ) {
			$( '.bcpp-discount-row' ).addClass( 'active' );
			$( '#discount_label_text' ).text( label );
			$( '#promo_discount_display' ).val( money( discounted ) );
		} else {
			$( '.bcpp-discount-row' ).removeClass( 'active' );
			$( '#promo_discount_display' ).val( '' );
		}

		var formattedTotal = subtotal > 0 ? money( total ) : '$ 0.00';
		$( '#sales_tax1' ).val( subtotal > 0 ? money( tax ) : '$ 0.00' );
		$( '#total1' ).val( formattedTotal );
		$( '.bcpp-live-total-display' ).text( formattedTotal );

		// Sync with Formidable hidden & form fields
		$( '.bcpp-subtotal input' ).val( subtotal > 0 ? money( subtotal ) : '' );
		$( '.bcpp-discount input' ).val( ( finalDiscount > 0 && subtotal > 0 ) ? money( discounted ) : '' );
		$( '.bcpp-tax input' ).val( subtotal > 0 ? money( tax ) : '' );
		$( '.bcpp-total input' ).val( subtotal > 0 ? money( total ) : '' );
		$( '.bcpp-discount-label input' ).val( label );
		$( '.bcpp-promo input' ).val( $( '#promo_code1' ).val() );

		updateRepeaterButtons();
		$( '.bcpp-taxexempt input[type="checkbox"]' ).prop( 'checked', isExempt );

		// Stripe Card Element mounting
		if ( settings.stripeEnabled ) {
			mountStripeCard();
		}
	}

	function mountStripeCard() {
		if ( ! settings.stripeEnabled || ! settings.stripePublicKey || ! window.Stripe || stripeMounted ) {
			return;
		}

		var $container = $( '#bcpp_card_element' );
		if ( ! $container.length ) {
			return;
		}

		try {
			if ( ! stripeInstance ) {
				stripeInstance = window.Stripe( settings.stripePublicKey );
			}
			if ( ! stripeElements ) {
				stripeElements = stripeInstance.elements();
			}

			stripeCardElement = stripeElements.create( 'card', {
				style: {
					base: {
						color: '#1e293b',
						fontFamily: '"Roboto", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
						fontSmoothing: 'antialiased',
						fontSize: '15px',
						'::placeholder': {
							color: '#94a3b8'
						},
						iconColor: '#ea580c'
					},
					invalid: {
						color: '#dc2626',
						iconColor: '#dc2626'
					}
				},
				hidePostalCode: false
			} );

			stripeCardElement.mount( '#bcpp_card_element' );

			stripeCardElement.on( 'change', function ( event ) {
				isOrderCardComplete = !! event.complete;
				var $err = $( '#bcpp_card_errors' );
				var $cardEl = $( '#bcpp_card_element' );
				if ( event.error ) {
					orderCardErrorMsg = event.error.message;
					$err.text( event.error.message ).show();
					$cardEl.addClass( 'bcpp-field-error' );
					if ( $cardEl[ 0 ] && $cardEl[ 0 ].style ) {
						$cardEl[ 0 ].style.setProperty( 'border', '1.5px solid #dc2626', 'important' );
						$cardEl[ 0 ].style.setProperty( 'border-color', '#dc2626', 'important' );
					}
				} else if ( event.complete ) {
					orderCardErrorMsg = '';
					$err.text( '' ).hide();
					$cardEl.removeClass( 'bcpp-field-error' );
					if ( $cardEl[ 0 ] && $cardEl[ 0 ].style ) {
						$cardEl[ 0 ].style.removeProperty( 'border' );
						$cardEl[ 0 ].style.removeProperty( 'border-color' );
					}
				} else {
					orderCardErrorMsg = '';
					$err.text( '' ).hide();
				}
			} );

			stripeMounted = true;
		} catch ( e ) {
			console.error( 'BCPP Stripe Init Error:', e );
			if ( $container.length ) {
				var msg = 'Credit card fields could not load.';
				if ( window.location.protocol !== 'https:' && settings.stripePublicKey && settings.stripePublicKey.indexOf( 'pk_live_' ) === 0 ) {
					msg = 'Live Stripe integrations require HTTPS. For local development or testing, switch to Test Mode with a Test Key (pk_test_...) in BCPP Settings.';
				}
				$container.html( '<div style="padding: 10px; font-size: 13px; color: #dc2626; line-height: 1.4;">' + msg + '</div>' );
			}
		}
	}

	function mountStripeGiftCard() {
		if ( ! settings.stripeEnabled || ! settings.stripePublicKey || ! window.Stripe || stripeGiftMounted ) {
			return;
		}

		var $container = $( '#bcpp_gift_card_element' );
		if ( ! $container.length ) {
			return;
		}

		try {
			if ( ! stripeInstance ) {
				stripeInstance = window.Stripe( settings.stripePublicKey );
			}
			if ( ! stripeElements ) {
				stripeElements = stripeInstance.elements();
			}

			stripeGiftCardElement = stripeElements.create( 'card', {
				style: {
					base: {
						color: '#1e293b',
						fontFamily: '"Roboto", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
						fontSmoothing: 'antialiased',
						fontSize: '15px',
						'::placeholder': {
							color: '#94a3b8'
						},
						iconColor: '#ea580c'
					},
					invalid: {
						color: '#dc2626',
						iconColor: '#dc2626'
					}
				},
				hidePostalCode: false
			} );

			stripeGiftCardElement.mount( '#bcpp_gift_card_element' );

			stripeGiftCardElement.on( 'change', function ( event ) {
				isGiftCardComplete = !! event.complete;
				var $err = $( '#bcpp_gift_card_errors' );
				var $cardEl = $( '#bcpp_gift_card_element' );
				if ( event.error ) {
					giftCardErrorMsg = event.error.message;
					$err.text( event.error.message ).show();
					$cardEl.addClass( 'bcpp-field-error' );
					if ( $cardEl[ 0 ] && $cardEl[ 0 ].style ) {
						$cardEl[ 0 ].style.setProperty( 'border', '1.5px solid #dc2626', 'important' );
						$cardEl[ 0 ].style.setProperty( 'border-color', '#dc2626', 'important' );
					}
				} else if ( event.complete ) {
					giftCardErrorMsg = '';
					$err.text( '' ).hide();
					$cardEl.removeClass( 'bcpp-field-error' );
					if ( $cardEl[ 0 ] && $cardEl[ 0 ].style ) {
						$cardEl[ 0 ].style.removeProperty( 'border' );
						$cardEl[ 0 ].style.removeProperty( 'border-color' );
					}
				} else {
					giftCardErrorMsg = '';
					$err.text( '' ).hide();
				}
			} );

			stripeGiftMounted = true;
		} catch ( e ) {
			console.error( 'BCPP Gift Stripe Init Error:', e );
			if ( $container.length ) {
				var msg = 'Credit card fields could not load.';
				if ( window.location.protocol !== 'https:' && settings.stripePublicKey && settings.stripePublicKey.indexOf( 'pk_live_' ) === 0 ) {
					msg = 'Live Stripe integrations require HTTPS. For local development or testing, switch to Test Mode with a Test Key (pk_test_...) in BCPP Settings.';
				}
				$container.html( '<div style="padding: 10px; font-size: 13px; color: #dc2626; line-height: 1.4;">' + msg + '</div>' );
			}
		}
	}

	function checkPromoCode() {
		var typed = $.trim( $( '#promo_code1' ).val() || $( '.bcpp-promo input' ).val() || '' ).toUpperCase();

		if ( typed === promoCode && promoValid ) {
			return;
		}

		if ( ! typed || ! settings.ajaxurl ) {
			promoRate = 0;
			promoAmount = 0;
			promoType = 'percent';
			promoCode = '';
			promoValid = false;
			recalculate();
			return;
		}

		if ( promoLookup ) {
			promoLookup.abort();
		}

		promoLookup = $.post( settings.ajaxurl, {
			action: 'bcpp_check_promo',
			nonce: settings.nonce,
			code: typed
		} ).done( function ( response ) {
			if ( response && response.data && response.data.valid ) {
				var data = response.data;
				promoValid = true;
				promoCode = typed;
				promoType = data.type || 'percent';
				promoRate = data.rate ? parseFloat( data.rate ) : 0;
				promoAmount = data.amount ? parseFloat( data.amount ) : ( data.value ? parseFloat( data.value ) : 0 );
			} else {
				promoValid = false;
				promoCode = '';
				promoRate = 0;
				promoAmount = 0;
				promoType = 'percent';
			}
			recalculate();
		} ).fail( function () {
			promoValid = false;
			promoCode = '';
			promoRate = 0;
			promoAmount = 0;
			promoType = 'percent';
			recalculate();
		} );
	}

	function removeSelectInlineColor() {
		$( '.bcpp-order-form select, #form_bcpp-order-form select, #form_gift-certificates select, .frm_forms select, select' ).each( function () {
			if ( this.style && this.style.color ) {
				this.style.removeProperty( 'color' );
			}
		} );
	}

	function showSubmitNotice( type, text, isGift ) {
		var noticeSelector = isGift ? '#bcpp_gift_submit_notice' : '#bcpp_submit_notice';
		var $notice = $( noticeSelector );
		if ( ! $notice.length ) {
			var $subCont = $( isGift ? '#frm_field_157_container, .frm_submit' : '#frm_field_79_container, .frm_submit' ).first().closest( '.frm_form_field, .frm_submit' );
			$notice = $( '<div id="' + ( isGift ? 'bcpp_gift_submit_notice' : 'bcpp_submit_notice' ) + '" class="bcpp-submit-notice" style="display:none;"></div>' );
			$subCont.after( $notice );
		}
		if ( type === 'processing' ) {
			$notice.removeClass( 'bcpp-notice-error bcpp-notice-success' ).addClass( 'bcpp-notice-processing' )
				.html( '<span class="bcpp-spinner"></span><span class="bcpp-notice-text">' + text + '</span>' ).fadeIn( 150 );
		} else if ( type === 'error' ) {
			$notice.removeClass( 'bcpp-notice-processing bcpp-notice-success' ).addClass( 'bcpp-notice-error' )
				.html( '<span class="bcpp-notice-icon">⚠️</span><span class="bcpp-notice-text">' + text + '</span>' ).fadeIn( 150 );
		} else if ( type === 'success' ) {
			$notice.removeClass( 'bcpp-notice-processing bcpp-notice-error' ).addClass( 'bcpp-notice-success' )
				.html( '<span class="bcpp-notice-icon">✓</span><span class="bcpp-notice-text">' + text + '</span>' ).fadeIn( 150 );
		} else {
			$notice.hide().empty();
		}
	}

	/* ------------------------------------------------------------------ */
	/* Gift Certificate Form Submission Handler                           */
	/* ------------------------------------------------------------------ */

	function handleGiftFormSubmit( $form, $btn, e ) {
		if ( $form.data( 'bcpp-paid' ) ) {
			return true;
		}

		if ( e ) {
			e.preventDefault();
			e.stopImmediatePropagation();
		}

		if ( isSubmittingPayment ) {
			return false;
		}

		var rawAmt = '';
		var $checkedRadio = $form.find( 'input[name="bcpp_gift_amount_radio"]:checked, input[name*="item_meta"][type="radio"]:checked' );
		if ( $checkedRadio.length ) {
			rawAmt = $checkedRadio.val();
		} else {
			rawAmt = $form.find( '#field_4ngwx, input[name*="[153]"], input[name*="[127]"]' ).filter( ':not([type="radio"])' ).val();
		}
		var amountVal = toNumber( rawAmt );

		if ( amountVal <= 0 ) {
			$( '#bcpp_gift_card_errors' ).text( 'Please select a gift certificate dollar amount.' ).fadeIn();
			showSubmitNotice( 'error', 'Please select a gift certificate dollar amount.', true );
			$( '#bcpp_gift_amount_radios, #field_4ngwx' ).first().focus();
			return false;
		}

		// Ensure underlying field is set before submitting
		$form.find( '#field_4ngwx, input[name*="[153]"], input[name*="[127]"]' ).filter( ':not([type="radio"])' ).val( amountVal.toFixed( 2 ) );

		// Validate sender & recipient info
		var fromFirst  = $.trim( $form.find( '#field_yc52, input[name*="[149]"], input[name*="[123]"]' ).val() || '' );
		var fromLast   = $.trim( $form.find( '#field_hr71e, input[name*="[150]"], input[name*="[124]"]' ).val() || '' );
		var fromEmail  = $.trim( $form.find( '#field_892jn, input[name*="[151]"], input[name*="[125]"]' ).val() || '' );
		var senderName = ( fromFirst + ' ' + fromLast ).trim() || 'Customer';

		if ( ! fromFirst || ! fromLast || ! fromEmail ) {
			showSubmitNotice( 'error', 'Please complete your sender information (First Name, Last Name, and Email).', true );
			$form.find( '#field_yc52, input[name*="[149]"], input[name*="[123]"]' ).first().focus();
			return false;
		}

		var selectedPaymentMethod = $form.find( '.bcpp-payment-method-input' ).val() || 'credit_card';

		// If paying via Venmo or Zelle, submit immediately without Stripe token
		if ( selectedPaymentMethod === 'venmo' || selectedPaymentMethod === 'zelle' ) {
			isSubmittingPayment = true;
			$btn.prop( 'disabled', true ).addClass( 'bcpp-loading' );
			var methodLabel = ( selectedPaymentMethod === 'venmo' ) ? 'Venmo' : 'Zelle';
			var note = ( selectedPaymentMethod === 'venmo' ) ? 'Venmo - Pending Verification' : 'Zelle - Pending Verification';
			$form.find( '#field_7lc98, input[name*="[155]"], input[name*="[128]"]' ).val( note );
			$form.data( 'bcpp-paid', true );
			showSubmitNotice( 'processing', 'Submitting your gift certificate order (paying via ' + methodLabel + ')... Please wait.', true );
			$form.submit();
			return true;
		}

		// Strict Card Validation
		if ( ! isGiftCardComplete ) {
			$( '#bcpp_gift_card_element' ).addClass( 'bcpp-field-error' );
			var gMsg = giftCardErrorMsg || 'Please enter complete credit or debit card details (card number, expiration date, and CVC).';
			$( '#bcpp_gift_card_errors' ).text( gMsg ).show();
			showSubmitNotice( 'error', gMsg, true );
			$( 'html, body' ).animate( {
				scrollTop: $( '#bcpp_gift_card_element' ).offset().top - 120
			}, 300 );
			return false;
		}

		if ( ! settings.stripeEnabled || ! stripeInstance || ! stripeGiftCardElement ) {
			showSubmitNotice( 'error', 'Payment processing is not configured. Please check your Stripe keys or contact support.', true );
			return false;
		}

		var formId = $form.find( 'input[name="form_id"]' ).val() || 17;

		isSubmittingPayment = true;
		$btn.prop( 'disabled', true ).addClass( 'bcpp-loading' );
		$( '#bcpp_gift_card_errors' ).hide().text( '' );
		showSubmitNotice( 'processing', 'Processing payment securely with Stripe... Please wait.', true );

		// 1. Create PaymentIntent on server
		$.post( settings.ajaxurl, {
			action: 'bcpp_create_payment_intent',
			nonce: settings.nonce,
			form_type: 'gift-certificates',
			form_id: formId,
			amount: amountVal,
			customer_name: senderName,
			customer_email: fromEmail,
			form_data: $form.serialize()
		} ).done( function ( res ) {
			if ( ! res || ! res.success || ! res.data ) {
				var msg = res && res.data && res.data.message ? res.data.message : 'Unable to authorize payment. Please check your card information.';
				giftPaymentError( msg, $btn );
				return;
			}

			if ( res.data.zero_total ) {
				$form.data( 'bcpp-paid', true );
				showSubmitNotice( 'processing', 'Submitting your gift certificate order... Please wait.', true );
				$form.submit();
				return;
			}

			var clientSecret = res.data.client_secret;
			var intentId     = res.data.payment_intent_id;

			// 2. Confirm card payment with Stripe.js
			stripeInstance.confirmCardPayment( clientSecret, {
				payment_method: {
					card: stripeGiftCardElement,
					billing_details: {
						name: senderName,
						email: fromEmail
					}
				}
			} ).then( function ( result ) {
				if ( result.error ) {
					giftPaymentError( result.error.message, $btn );
				} else if ( result.paymentIntent && result.paymentIntent.status === 'succeeded' ) {
					// Payment Succeeded!
					if ( ! $form.find( 'input[name="bcpp_payment_intent_id"]' ).length ) {
						$form.append( '<input type="hidden" name="bcpp_payment_intent_id" value="' + intentId + '" />' );
					} else {
						$form.find( 'input[name="bcpp_payment_intent_id"]' ).val( intentId );
					}

					$form.find( '#field_7lc98, input[name*="[155]"], input[name*="[128]"]' ).val( 'Paid via Stripe (ID: ' + intentId + ')' );

					$form.data( 'bcpp-paid', true );
					showSubmitNotice( 'processing', 'Payment authorized! Finalizing your gift certificate... Please wait.', true );
					$form.submit();
				} else {
					giftPaymentError( 'Payment status could not be verified. Please try again.', $btn );
				}
			} ).catch( function ( err ) {
				giftPaymentError( err && err.message ? err.message : 'An error occurred during payment processing.', $btn );
			} );
		} ).fail( function () {
			giftPaymentError( 'Payment server connection error. Please try again.', $btn );
		} );
	}

	function giftPaymentError( msg, $btn ) {
		isSubmittingPayment = false;
		$( '#bcpp_gift_card_errors' ).text( msg ).fadeIn();
		showSubmitNotice( 'error', msg, true );
		if ( $btn ) {
			$btn.prop( 'disabled', false ).removeClass( 'bcpp-loading' );
		}
	}

	/* ------------------------------------------------------------------ */
	/* Order Form Submission Handler                                      */
	/* ------------------------------------------------------------------ */

	function validateOrderForm( $form ) {
		// Reset previous errors
		$( '.bcpp-field-error' ).removeClass( 'bcpp-field-error' ).each( function () {
			if ( this.style ) {
				this.style.removeProperty( 'border' );
				this.style.removeProperty( 'border-color' );
			}
		} );
		$( '#bcpp_card_errors' ).hide().text( '' );

		var firstInvalid = null;
		var errorMessages = [];

		function markError( $el ) {
			if ( $el && $el.length ) {
				$el.addClass( 'bcpp-field-error' );
				$el.each( function () {
					if ( this.style ) {
						this.style.setProperty( 'border', '1.5px solid #dc2626', 'important' );
						this.style.setProperty( 'border-color', '#dc2626', 'important' );
					}
				} );
				if ( ! firstInvalid ) {
					firstInvalid = $el.first();
				}
			}
		}

		// 1. Validate Contact Info
		var contactFields = [
			{ sel: 'input[name*="[122]"], #field_first-name, input[name*="first"]', name: 'First Name' },
			{ sel: 'input[name*="[123]"], #field_last-name, input[name*="last"]', name: 'Last Name' },
			{ sel: 'input[name*="[124]"], #field_address-1, input[name*="address-1"], input[name*="address_1"]', name: 'Address 1' },
			{ sel: 'input[name*="[126]"], #field_city, input[name*="city"]', name: 'City' },
			{ sel: 'select[name*="[127]"], #field_state, select[name*="state"]', name: 'State' },
			{ sel: 'input[name*="[128]"], #field_zip-code, input[name*="zip"]', name: 'Zip Code' },
			{ sel: 'input[name*="[129]"], #field_telephone, input[type="tel"], input[name*="telephone"], input[name*="phone"]', name: 'Phone Number' },
			{ sel: 'input[name*="[130]"], #field_email, input[type="email"], input[name*="email"]', name: 'Email Address' }
		];

		var missingContacts = [];
		for ( var i = 0; i < contactFields.length; i++ ) {
			var $field = $form.find( contactFields[ i ].sel ).first();
			if ( $field.length ) {
				var val = $.trim( $field.val() );
				var isState = contactFields[ i ].name === 'State';
				var isStateEmpty = isState && ( ! val || val.toLowerCase() === 'select state' || val.toLowerCase() === 'state' );
				if ( ! val || isStateEmpty ) {
					markError( $field );
					missingContacts.push( contactFields[ i ].name );
				}
			}
		}
		if ( missingContacts.length ) {
			errorMessages.push( 'Please fill in required contact details: ' + missingContacts.join( ', ' ) + '.' );
		}

		// 2. Validate Specialty Papers Repeater
		var specialtyPrints = 0;
		var $specRows = $( '.bcpp-specialty .frm_repeat_sec, .bcpp-specialty .frm_repeat_both, #frm_field_133_container .frm_repeat_sec, [id^="frm_section_133-"], .frm_repeat_133' );
		for ( var s = 0; s < $specRows.length; s++ ) {
			var $sRow = $( $specRows[ s ] );
			var $sFile = $sRow.find( 'input[name*="[113]"], input[id^="field_specialty-file-name"], .bcpp-col-file input' ).first();
			var $sBorder = $sRow.find( 'select[name*="[114]"], select[id^="field_specialty-border"], .bcpp-col-border select' ).first();
			var $sSize = $sRow.find( 'select[name*="[115]"], select[id^="field_specialty-print-size"], .bcpp-col-size select' ).first();
			var $sPaper = $sRow.find( 'select[name*="[116]"], select[id^="field_specialty-paper"], .bcpp-col-paper select' ).first();
			var $sAmt = $sRow.find( 'input[name*="[117]"], input[id^="field_specialty-amt"], .bcpp-col-amt input' ).first();

			var sFileVal = $.trim( $sFile.val() );
			var sBorderVal = $.trim( $sBorder.val() );
			var sSizeVal = $.trim( $sSize.val() );
			var sPaperVal = $.trim( $sPaper.val() );
			var sAmtVal = toNumber( $sAmt.val() );

			var sHasFile = sFileVal !== '';
			var sHasBorder = sBorderVal !== '' && sBorderVal.toLowerCase() !== 'y/n';
			var sHasSize = sSizeVal !== '' && sSizeVal.toLowerCase() !== 'select size';
			var sHasPaper = sPaperVal !== '' && sPaperVal.toLowerCase() !== 'select paper';
			var sHasAmt = sAmtVal > 0;

			// A row is active only if the user entered a file name, border, size, or paper (quantity defaults to 1)
			var sHasAny = sHasFile || sHasBorder || sHasSize || sHasPaper;

			if ( sHasAny ) {
				var sRowErrors = [];
				if ( ! sHasFile ) { markError( $sFile ); sRowErrors.push( 'File Name' ); }
				if ( ! sHasBorder ) { markError( $sBorder ); sRowErrors.push( 'Border' ); }
				if ( ! sHasSize ) { markError( $sSize ); sRowErrors.push( 'Print Size' ); }
				if ( ! sHasPaper ) { markError( $sPaper ); sRowErrors.push( 'Paper' ); }
				if ( ! sHasAmt ) { markError( $sAmt ); sRowErrors.push( 'Amt' ); }

				if ( sRowErrors.length ) {
					errorMessages.push( 'Specialty Papers row #' + ( s + 1 ) + ' is missing: ' + sRowErrors.join( ', ' ) + '.' );
				} else {
					specialtyPrints += ( priceFromLabel( $sSize.find( 'option:selected' ).text() || sSizeVal ) * sAmtVal );
				}
			}
		}

		// 3. Validate Premium Papers Repeater
		var premiumPrints = 0;
		var $premRows = $( '.bcpp-premium .frm_repeat_sec, .bcpp-premium .frm_repeat_both, #frm_field_131_container .frm_repeat_sec, [id^="frm_section_131-"], .frm_repeat_131' );
		for ( var r = 0; r < $premRows.length; r++ ) {
			var $row = $( $premRows[ r ] );
			var $file = $row.find( 'input[name*="[107]"], input[id^="field_premium-file-name"], .bcpp-col-file input' ).first();
			var $border = $row.find( 'select[name*="[108]"], select[id^="field_premium-border"], .bcpp-col-border select' ).first();
			var $size = $row.find( 'select[name*="[109]"], select[id^="field_premium-print-size"], .bcpp-col-size select' ).first();
			var $paper = $row.find( 'select[name*="[110]"], select[id^="field_premium-paper"], .bcpp-col-paper select' ).first();
			var $amt = $row.find( 'input[name*="[111]"], input[id^="field_premium-amt"], .bcpp-col-amt input' ).first();

			var fileVal = $.trim( $file.val() );
			var borderVal = $.trim( $border.val() );
			var sizeVal = $.trim( $size.val() );
			var paperVal = $.trim( $paper.val() );
			var amtVal = toNumber( $amt.val() );

			var hasFile = fileVal !== '';
			var hasBorder = borderVal !== '' && borderVal.toLowerCase() !== 'y/n';
			var hasSize = sizeVal !== '' && sizeVal.toLowerCase() !== 'select size';
			var hasPaper = paperVal !== '' && paperVal.toLowerCase() !== 'select paper';
			var hasAmt = amtVal > 0;

			// Extra rows are active only if the user entered file, border, size, or paper
			var hasAny = hasFile || hasBorder || hasSize || hasPaper;

			// Row 0 is required if no specialty prints ordered; extra rows (r > 0) are only validated if touched
			var isRow0Required = ( r === 0 && specialtyPrints <= 0 );
			if ( isRow0Required || hasAny ) {
				var rowErrors = [];
				if ( ! hasFile ) { markError( $file ); rowErrors.push( 'File Name' ); }
				if ( ! hasBorder ) { markError( $border ); rowErrors.push( 'Border' ); }
				if ( ! hasSize ) { markError( $size ); rowErrors.push( 'Print Size' ); }
				if ( ! hasPaper ) { markError( $paper ); rowErrors.push( 'Paper' ); }
				if ( ! hasAmt ) { markError( $amt ); rowErrors.push( 'Amt' ); }

				if ( rowErrors.length ) {
					errorMessages.push( 'Premium Papers row #' + ( r + 1 ) + ' is missing: ' + rowErrors.join( ', ' ) + '.' );
				} else {
					premiumPrints += ( priceFromLabel( $size.find( 'option:selected' ).text() || sizeVal ) * amtVal );
				}
			}
		}

		// 4. Validate Additional Services
		var totalAddl = 0;
		$( '.bcpp-additional' ).find( '.frm_repeat_sec, .frm_repeat_both' ).each( function () {
			var rowSub = toNumber( $( this ).find( '.bcpp-addsub input' ).val() );
			totalAddl += rowSub;
		} );

		var grandSubtotal = premiumPrints + specialtyPrints + totalAddl;
		if ( grandSubtotal <= 0 ) {
			errorMessages.push( 'Please specify at least one print order with size and quantity.' );
		}

		// 5. Validate Credit Card when Total > 0 or Grand Subtotal > 0 (Only for credit_card method)
		var selectedPaymentMethod = $form.find( '.bcpp-payment-method-input' ).val() || 'credit_card';
		if ( selectedPaymentMethod === 'credit_card' ) {
			var currentTotal = toNumber( $( '#total1' ).val() );
			if ( currentTotal > 0 || grandSubtotal > 0 ) {
				if ( ! isOrderCardComplete ) {
					markError( $( '#bcpp_card_element' ) );
					var cardMsg = orderCardErrorMsg || 'Please enter complete credit card information (card number, expiration date, and CVC).';
					$( '#bcpp_card_errors' ).text( cardMsg ).show();
					errorMessages.push( cardMsg );
				}
			}
		}

		if ( errorMessages.length > 0 ) {
			return {
				valid: false,
				message: errorMessages.length === 1 ? errorMessages[ 0 ] : 'Please complete all required fields highlighted in red below.',
				$firstError: firstInvalid
			};
		}

		return { valid: true };
	}

	function handleOrderFormSubmit( $form, $btn, e ) {
		if ( $form.data( 'bcpp-paid' ) ) {
			return true;
		}

		if ( e ) {
			e.preventDefault();
			e.stopImmediatePropagation();
		}

		if ( isSubmittingPayment ) {
			return false;
		}

		var validation = validateOrderForm( $form );
		if ( ! validation.valid ) {
			showSubmitNotice( 'error', validation.message, false );
			if ( validation.$firstError && validation.$firstError.length ) {
				$( 'html, body' ).animate( {
					scrollTop: validation.$firstError.offset().top - 120
				}, 300, function () {
					validation.$firstError.focus();
				} );
			}
			return false;
		}

		var selectedPaymentMethod = $form.find( '.bcpp-payment-method-input' ).val() || 'credit_card';

		// If paying via Venmo or Zelle, submit immediately without Stripe token
		if ( selectedPaymentMethod === 'venmo' || selectedPaymentMethod === 'zelle' ) {
			isSubmittingPayment = true;
			$btn.prop( 'disabled', true ).addClass( 'bcpp-loading' );
			var methodLabel = ( selectedPaymentMethod === 'venmo' ) ? 'Venmo' : 'Zelle';
			showSubmitNotice( 'processing', 'Submitting your order (paying via ' + methodLabel + ')... Please wait.', false );
			$form.data( 'bcpp-paid', true );
			$form.submit();
			return true;
		}

		var totalVal = toNumber( $( '#total1' ).val() );

		// If total is $0.00 (e.g. 100% gift certificate discount), submit normally with loading state
		if ( totalVal <= 0 ) {
			isSubmittingPayment = true;
			$btn.prop( 'disabled', true ).addClass( 'bcpp-loading' );
			showSubmitNotice( 'processing', 'Submitting your order... Please wait.', false );
			$form.data( 'bcpp-paid', true );
			$form.submit();
			return true;
		}

		// If total > 0 but Stripe is not initialized/enabled
		if ( ! settings.stripeEnabled || ! stripeInstance || ! stripeCardElement ) {
			showSubmitNotice( 'error', 'Payment processing is not configured. Please check your Stripe keys or contact support.', false );
			return false;
		}

		var firstName    = $.trim( $( 'input[name*="[122]"], #field_first-name, input[placeholder*="First"]' ).val() || '' );
		var lastName     = $.trim( $( 'input[name*="[123]"], #field_last-name, input[placeholder*="Last"]' ).val() || '' );
		var email        = $.trim( $( 'input[name*="[130]"], #field_email, input[type="email"]' ).val() || '' );
		var customerName = ( firstName + ' ' + lastName ).trim() || 'Customer';

		isSubmittingPayment = true;
		$btn.prop( 'disabled', true ).addClass( 'bcpp-loading' );
		$( '#bcpp_card_errors' ).hide().text( '' );
		showSubmitNotice( 'processing', 'Processing payment securely with Stripe... Please wait.', false );

		// 1. Create PaymentIntent on server
		$.post( settings.ajaxurl, {
			action: 'bcpp_create_payment_intent',
			nonce: settings.nonce,
			customer_name: customerName,
			customer_email: email,
			form_data: $form.serialize()
		} ).done( function ( res ) {
			if ( ! res || ! res.success || ! res.data ) {
				var msg = res && res.data && res.data.message ? res.data.message : 'Unable to authorize payment. Please check your card information.';
				orderPaymentError( msg, $btn );
				return;
			}

			if ( res.data.zero_total ) {
				$form.data( 'bcpp-paid', true );
				showSubmitNotice( 'processing', 'Submitting your order... Please wait.', false );
				$form.submit();
				return;
			}

			var clientSecret = res.data.client_secret;
			var intentId     = res.data.payment_intent_id;

			// 2. Confirm card payment with Stripe.js
			stripeInstance.confirmCardPayment( clientSecret, {
				payment_method: {
					card: stripeCardElement,
					billing_details: {
						name: customerName,
						email: email
					}
				}
			} ).then( function ( result ) {
				if ( result.error ) {
					orderPaymentError( result.error.message, $btn );
				} else if ( result.paymentIntent && result.paymentIntent.status === 'succeeded' ) {
					// Payment Succeeded!
					if ( ! $form.find( 'input[name="bcpp_payment_intent_id"]' ).length ) {
						$form.append( '<input type="hidden" name="bcpp_payment_intent_id" value="' + intentId + '" />' );
					} else {
						$form.find( 'input[name="bcpp_payment_intent_id"]' ).val( intentId );
					}
					$form.data( 'bcpp-paid', true );
					showSubmitNotice( 'processing', 'Payment authorized! Finalizing your order... Please wait.', false );
					$form.submit();
				} else {
					orderPaymentError( 'Payment status could not be verified. Please try again.', $btn );
				}
			} ).catch( function ( err ) {
				orderPaymentError( err && err.message ? err.message : 'An error occurred during payment processing.', $btn );
			} );
		} ).fail( function () {
			orderPaymentError( 'Payment server connection error. Please try again.', $btn );
		} );
	}

	function orderPaymentError( msg, $btn ) {
		isSubmittingPayment = false;
		$( '#bcpp_card_errors' ).text( msg ).fadeIn();
		showSubmitNotice( 'error', msg, false );
		if ( $btn ) {
			$btn.prop( 'disabled', false ).removeClass( 'bcpp-loading' );
		}
	}

	/* ------------------------------------------------------------------ */
	/* Document Ready & Event Bindings                                    */
	/* ------------------------------------------------------------------ */

	$( function () {
		setupFormStructure();
		setupGiftFormStructure();
		removeSelectInlineColor();

		// Watch for Formidable's inline style additions on SELECT elements and remove them
		if ( window.MutationObserver ) {
			var selectObserver = new MutationObserver( function ( mutations ) {
				for ( var i = 0; i < mutations.length; i++ ) {
					var target = mutations[ i ].target;
					if ( target && target.tagName === 'SELECT' && target.style && target.style.color ) {
						target.style.removeProperty( 'color' );
					}
				}
			} );
			var formEl = document.querySelector( '.bcpp-order-form, #form_bcpp-order-form, #form_gift-certificates, .frm_forms' ) || document.body;
			if ( formEl ) {
				selectObserver.observe( formEl, { attributes: true, subtree: true, attributeFilter: [ 'style' ] } );
			}
		}

		// Live row calculations
		$( document ).on( 'change keyup', '.bcpp-size select, .bcpp-amt input', function () {
			removeSelectInlineColor();
			repriceRow( this );
			recalculate();
		} );

		$( document ).on( 'change', 'select', function () {
			removeSelectInlineColor();
		} );

		// Additional calculations
		$( document ).on( 'change keyup', '.bcpp-addsub input', recalculate );
		$( document ).on( 'blur', '.bcpp-addsub input', function () {
			var value = toNumber( this.value );
			this.value = value ? money( value ) : '$ 0.00';
			recalculate();
		} );

		// Promo code events
		$( document ).on( 'blur keydown', '#promo_code1', function ( e ) {
			if ( e.type === 'keydown' && e.which !== 13 ) {
				return;
			}
			if ( e.which === 13 ) {
				e.preventDefault();
			}
			checkPromoCode();
		} );

		// Tax exempt toggle
		$( document ).on( 'change', '#tax_exempt_toggle', function () {
			$( '.bcpp-taxexempt input[type="checkbox"]' ).prop( 'checked', this.checked );
			recalculate();
		} );

		// Clear red border immediately when user corrects any field
		$( document ).on( 'input change keyup blur', 'input, select, textarea', function () {
			var $el = $( this );
			if ( $el.hasClass( 'bcpp-field-error' ) ) {
				var val = $.trim( $el.val() || '' );
				var isNumber = $el.is( 'input[type="number"], [id*="-amt"]' );
				var isPlaceholder = false;

				if ( isNumber ) {
					isPlaceholder = toNumber( val ) <= 0;
				} else if ( $el.is( 'select' ) ) {
					var lower = val.toLowerCase();
					isPlaceholder = ( val === '' || lower === 'state' || lower === 'select state' || lower === 'y/n' || lower === 'select size' || lower === 'select paper' );
				} else {
					isPlaceholder = ( val === '' );
				}

				if ( ! isPlaceholder ) {
					$el.removeClass( 'bcpp-field-error' );
					if ( this.style ) {
						this.style.removeProperty( 'border' );
						this.style.removeProperty( 'border-color' );
					}
				}
			}
		} );

		$( document ).on( 'frmAfterAddRow frmAfterRemoveRow', function () {
			ensureRowLabels();
			removeSelectInlineColor();
			updateRepeaterButtons();
			recalculate();
		} );

		$( document ).on( 'click', '.frm_add_form_row, .frm_remove_form_row', function () {
			setTimeout( function () {
				ensureRowLabels();
				removeSelectInlineColor();
				$( '.bcpp-size select' ).each( function () {
					repriceRow( this );
				} );
				updateRepeaterButtons();
				recalculate();
			}, 100 );
			setTimeout( function () {
				ensureRowLabels();
				removeSelectInlineColor();
				updateRepeaterButtons();
				recalculate();
			}, 300 );
		} );

		// Payment Method Tab Switching
		$( document ).on( 'click', '.bcpp-payment-tab', function ( e ) {
			e.preventDefault();
			var $tab = $( this );
			var method = $tab.data( 'method' );
			var $module = $tab.closest( '.bcpp-payment-module' );

			$module.find( '.bcpp-payment-tab' ).removeClass( 'active' );
			$tab.addClass( 'active' );

			$module.find( '.bcpp-payment-method-input' ).val( method );

			$module.find( '.bcpp-payment-panel' ).hide();
			$module.find( '.bcpp-panel-' + method ).fadeIn( 150 );

			if ( method === 'credit_card' ) {
				mountStripeCard();
				mountStripeGiftCard();
			}
		} );

		// Copy Button Handler
		$( document ).on( 'click', '.bcpp-copy-btn', function ( e ) {
			e.preventDefault();
			var $btn = $( this );
			var textToCopy = $btn.closest( '.bcpp-copyable' ).data( 'copy' ) || $btn.siblings( 'strong' ).text();

			if ( navigator.clipboard && navigator.clipboard.writeText ) {
				navigator.clipboard.writeText( textToCopy ).then( function () {
					$btn.text( '✓ Copied!' ).addClass( 'copied' );
					setTimeout( function () {
						$btn.text( '📋 Copy' ).removeClass( 'copied' );
					}, 2000 );
				} );
			} else {
				var $temp = $( '<input>' );
				$( 'body' ).append( $temp );
				$temp.val( textToCopy ).select();
				document.execCommand( 'copy' );
				$temp.remove();
				$btn.text( '✓ Copied!' ).addClass( 'copied' );
				setTimeout( function () {
					$btn.text( '📋 Copy' ).removeClass( 'copied' );
				}, 2000 );
			}
		} );

		// Formidable Submit Router
		$( document ).on( 'click', '.frm_button_submit, #send-message', function ( e ) {
			var $form = $( this ).closest( 'form' );
			if ( ! $form.length ) {
				$form = $( '#form_gift-certificates, form.bcpp-gift-form, #form_bcpp-order-form, .bcpp-order-form, [id^="frm_form_"] form' ).first();
			}

			var isGift = $form.is( '#form_gift-certificates, .bcpp-gift-form, #frm_form_17_container form, #frm_form_12_container form' ) ||
			             $form.find( 'input[name="form_key"][value="gift-certificates"]' ).length > 0 ||
			             $form.find( 'input[name="form_id"][value="17"], input[name="form_id"][value="12"]' ).length > 0 ||
			             $form.find( '#field_5s2ph, #field_yc52, #field_4ngwx' ).length > 0;

			if ( isGift ) {
				return handleGiftFormSubmit( $form, $( this ), e );
			}

			return handleOrderFormSubmit( $form, $( this ), e );
		} );

		$( document ).on( 'submit', 'form.bcpp-order-form, #form_bcpp-order-form, #frm_form_16_container form, #form_gift-certificates, form.bcpp-gift-form, #frm_form_17_container form, #frm_form_12_container form', function ( e ) {
			var $form = $( this );
			if ( $form.data( 'bcpp-paid' ) ) {
				return true;
			}

			var isGift = $form.is( '#form_gift-certificates, .bcpp-gift-form, #frm_form_17_container form, #frm_form_12_container form' ) ||
			             $form.find( 'input[name="form_key"][value="gift-certificates"]' ).length > 0 ||
			             $form.find( 'input[name="form_id"][value="17"], input[name="form_id"][value="12"]' ).length > 0 ||
			             $form.find( '#field_5s2ph, #field_yc52, #field_4ngwx' ).length > 0;

			var $btn = $form.find( '.frm_button_submit, #send-message' ).first();
			if ( isGift ) {
				return handleGiftFormSubmit( $form, $btn, e );
			}
			return handleOrderFormSubmit( $form, $btn, e );
		} );

		// Initial calculation & card mount
		mountStripeCard();
		mountStripeGiftCard();
		recalculate();
		removeSelectInlineColor();
	} );
}( jQuery ) );
