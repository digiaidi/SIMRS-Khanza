// PRODUCT-DEV/khanza_rs_scaffold/khanza_rs/rawat_jalan/doctype/asesmen_rme_spesifik/asesmen_rme_spesifik.js
// Client-side script to render dynamic forms based on chosen specialty and serialize to JSON

frappe.ui.form.on('Asesmen RME Spesifik', {
    refresh: function(frm) {
        frm.trigger('render_form_dinamis');
    },
    tipe_asesmen: function(frm) {
        // Reset JSON data when specialty changes to default template
        frm.set_value('data_dinamis', '{}');
        frm.trigger('render_form_dinamis');
    },
    render_form_dinamis: function(frm) {
        const wrapper = frm.fields_dict['form_dinamis_html'].$wrapper;
        wrapper.empty();

        const tipe = frm.doc.tipe_asesmen;
        if (!tipe) {
            wrapper.html('<div class="text-muted text-center" style="padding: 20px;">Silakan pilih Tipe Asesmen untuk memuat formulir spesifik.</div>');
            return;
        }

        // Get current JSON values or default to empty object
        let values = {};
        try {
            values = JSON.parse(frm.doc.data_dinamis || '{}');
        } catch (e) {
            values = {};
        }

        // Define form fields template schemas based on specialty
        const schemas = {
            "Anak": [
                { id: "berat_badan", label: "Berat Badan (kg)", type: "number" },
                { id: "tinggi_badan", label: "Tinggi Badan (cm)", type: "number" },
                { id: "lingkar_kepala", label: "Lingkar Kepala (cm)", type: "number" },
                { id: "status_imunisasi", label: "Status Imunisasi Lengkap", type: "select", options: ["Ya", "Tidak"] },
                { id: "riwayat_tumbuh_kembang", label: "Riwayat Tumbuh Kembang", type: "text" }
            ],
            "Kandungan": [
                { id: "hpht", label: "Hari Pertama Haid Terakhir (HPHT)", type: "date" },
                { id: "hpl", label: "Hari Perkiraan Lahir (HPL)", type: "date" },
                { id: "gravida", label: "Gravida (G)", type: "number" },
                { id: "partus", label: "Partus (P)", type: "number" },
                { id: "abortus", label: "Abortus (A)", type: "number" },
                { id: "posisi_janin", label: "Posisi Janin", type: "text" }
            ],
            "Mata": [
                { id: "visus_od", label: "Visus Mata Kanan (OD)", type: "text" },
                { id: "visus_os", label: "Visus Mata Kiri (OS)", type: "text" },
                { id: "tekanan_intraokular_od", label: "TIO Mata Kanan (OD)", type: "text" },
                { id: "tekanan_intraokular_os", label: "TIO Mata Kiri (OS)", type: "text" },
                { id: "kelainan_refraksi", label: "Diagnosa Refraksi/Kacamata", type: "text" }
            ],
            "THT": [
                { id: "telinga_kanan", label: "Kondisi Telinga Kanan", type: "text" },
                { id: "telinga_kiri", label: "Kondisi Telinga Kiri", type: "text" },
                { id: "hidung", label: "Kondisi Hidung", type: "text" },
                { id: "tenggorokan", label: "Kondisi Tenggorokan", type: "text" }
            ],
            "Jiwa": [
                { id: "keadaan_umum", label: "Keadaan Umum Psikis", type: "text" },
                { id: "alam_perasaan", label: "Alam Perasaan", type: "select", options: ["Eutimik", "Depresif", "Manik", "Cemas"] },
                { id: "proses_pikir", label: "Proses Pikir / Asosiasi", type: "text" },
                { id: "halusinasi", label: "Halusinasi / Waham", type: "text" }
            ],
            "Gigi": [
                { id: "odontogram", label: "Kondisi Odontogram (Gigi)", type: "text" },
                { id: "karang_gigi", label: "Karang Gigi / Kalkulus", type: "select", options: ["Tidak Ada", "Ringan", "Sedang", "Berat"] },
                { id: "mukosa_mulut", label: "Kondisi Mukosa Mulut", type: "text" }
            ],
            "Fisioterapi": [
                { id: "diagnosis_fungsi", label: "Diagnosis Fungsional", type: "text" },
                { id: "tindakan_terapi", label: "Tindakan Terapi Fisik", type: "text" },
                { id: "evaluasi_kemajuan", label: "Evaluasi/Kemajuan Pasien", type: "text" }
            ]
        };

        const fields = schemas[tipe] || [];
        
        // Build beautiful UI form with bootstrap layout inside the HTML wrapper
        let html = `<div style="background-color: var(--gray-50); border: 1px solid var(--border-color); border-radius: 8px; padding: 20px; margin-bottom: 15px;">`;
        html += `<h4 style="margin-top: 0; color: var(--text-color); margin-bottom: 15px;"><i class="fa fa-pencil-square-o"></i> Asesmen Khusus ${tipe}</h4>`;
        html += `<div class="row">`;

        fields.forEach(field => {
            const currentVal = values[field.id] !== undefined ? values[field.id] : "";
            html += `<div class="col-md-6" style="margin-bottom: 15px;">`;
            html += `<label class="control-label" style="font-weight: 500; font-size: 13px; color: var(--text-muted); display: block; margin-bottom: 5px;">${field.label}</label>`;

            if (field.type === "select") {
                html += `<select class="form-control rme-input" data-field-id="${field.id}" style="width: 100%; height: 36px; border-radius: 4px; border: 1px solid var(--border-color); padding: 5px 10px;">`;
                html += `<option value=""></option>`;
                field.options.forEach(opt => {
                    const selected = opt === currentVal ? "selected" : "";
                    html += `<option value="${opt}" ${selected}>${opt}</option>`;
                });
                html += `</select>`;
            } else if (field.type === "date") {
                html += `<input type="date" class="form-control rme-input" data-field-id="${field.id}" value="${currentVal}" style="width: 100%; height: 36px; border-radius: 4px; border: 1px solid var(--border-color); padding: 5px 10px;">`;
            } else if (field.type === "number") {
                html += `<input type="number" step="any" class="form-control rme-input" data-field-id="${field.id}" value="${currentVal}" style="width: 100%; height: 36px; border-radius: 4px; border: 1px solid var(--border-color); padding: 5px 10px;">`;
            } else {
                html += `<input type="text" class="form-control rme-input" data-field-id="${field.id}" value="${currentVal}" style="width: 100%; height: 36px; border-radius: 4px; border: 1px solid var(--border-color); padding: 5px 10px;">`;
            }
            html += `</div>`;
        });

        html += `</div></div>`;
        wrapper.html(html);

        // Bind input event listener to serialize form input fields back into the JSON code field
        wrapper.find('.rme-input').on('change input', function() {
            const updatedValues = {};
            wrapper.find('.rme-input').each(function() {
                const fId = $(this).data('field-id');
                const val = $(this).val();
                if (val !== "") {
                    updatedValues[fId] = val;
                }
            });
            // Update the hidden code field
            frm.set_value('data_dinamis', JSON.stringify(updatedValues, null, 2));
        });
    }
});
