import { useState } from "react";
import { Input } from "./input";
import { Label } from "./label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";

const COUNTRY_CODES = [
  // West Africa
  { code: "+226", country: "Burkina Faso", flag: "🇧🇫" },
  { code: "+225", country: "Côte d'Ivoire", flag: "🇨🇮" },
  { code: "+223", country: "Mali", flag: "🇲🇱" },
  { code: "+227", country: "Niger", flag: "🇳🇪" },
  { code: "+221", country: "Senegal", flag: "🇸🇳" },
  { code: "+228", country: "Togo", flag: "🇹🇬" },
  { code: "+229", country: "Benin", flag: "🇧🇯" },
  { code: "+234", country: "Nigeria", flag: "🇳🇬" },
  { code: "+233", country: "Ghana", flag: "🇬🇭" },
  { code: "+231", country: "Liberia", flag: "🇱🇷" },
  { code: "+232", country: "Sierra Leone", flag: "🇸🇱" },
  { code: "+224", country: "Guinea", flag: "🇬🇳" },
  { code: "+245", country: "Guinea-Bissau", flag: "🇬🇼" },
  { code: "+220", country: "Gambia", flag: "🇬🇲" },
  { code: "+238", country: "Cape Verde", flag: "🇨🇻" },
  
  // Central Africa
  { code: "+243", country: "DR Congo", flag: "🇨🇩" },
  { code: "+242", country: "Congo", flag: "🇨🇬" },
  { code: "+237", country: "Cameroon", flag: "🇨🇲" },
  { code: "+236", country: "Central African Rep.", flag: "🇨🇫" },
  { code: "+235", country: "Chad", flag: "🇹🇩" },
  { code: "+240", country: "Equatorial Guinea", flag: "🇬🇶" },
  { code: "+241", country: "Gabon", flag: "🇬🇦" },
  { code: "+239", country: "São Tomé & Príncipe", flag: "🇸🇹" },
  
  // East Africa
  { code: "+250", country: "Rwanda", flag: "🇷🇼" },
  { code: "+254", country: "Kenya", flag: "🇰🇪" },
  { code: "+255", country: "Tanzania", flag: "🇹🇿" },
  { code: "+256", country: "Uganda", flag: "🇺🇬" },
  { code: "+257", country: "Burundi", flag: "🇧🇮" },
  { code: "+251", country: "Ethiopia", flag: "🇪🇹" },
  { code: "+252", country: "Somalia", flag: "🇸🇴" },
  { code: "+253", country: "Djibouti", flag: "🇩🇯" },
  { code: "+211", country: "South Sudan", flag: "🇸🇸" },
  { code: "+249", country: "Sudan", flag: "🇸🇩" },
  { code: "+291", country: "Eritrea", flag: "🇪🇷" },
  
  // Southern Africa
  { code: "+27", country: "South Africa", flag: "🇿🇦" },
  { code: "+264", country: "Namibia", flag: "🇳🇦" },
  { code: "+267", country: "Botswana", flag: "🇧🇼" },
  { code: "+268", country: "Eswatini", flag: "🇸🇿" },
  { code: "+266", country: "Lesotho", flag: "🇱🇸" },
  { code: "+258", country: "Mozambique", flag: "🇲🇿" },
  { code: "+260", country: "Zambia", flag: "🇿🇲" },
  { code: "+263", country: "Zimbabwe", flag: "🇿🇼" },
  { code: "+265", country: "Malawi", flag: "🇲🇼" },
  { code: "+261", country: "Madagascar", flag: "🇲🇬" },
  { code: "+230", country: "Mauritius", flag: "🇲🇺" },
  { code: "+248", country: "Seychelles", flag: "🇸🇨" },
  { code: "+269", country: "Comoros", flag: "🇰🇲" },
  { code: "+262", country: "Réunion", flag: "🇷🇪" },
  
  // North Africa
  { code: "+20", country: "Egypt", flag: "🇪🇬" },
  { code: "+212", country: "Morocco", flag: "🇲🇦" },
  { code: "+213", country: "Algeria", flag: "🇩🇿" },
  { code: "+216", country: "Tunisia", flag: "🇹🇳" },
  { code: "+218", country: "Libya", flag: "🇱🇾" },
  { code: "+222", country: "Mauritania", flag: "🇲🇷" },
  
  // Other Major Countries
  { code: "+1", country: "US/Canada", flag: "🇺🇸" },
  { code: "+44", country: "UK", flag: "🇬🇧" },
  { code: "+33", country: "France", flag: "🇫🇷" },
  { code: "+49", country: "Germany", flag: "🇩🇪" },
  { code: "+91", country: "India", flag: "🇮🇳" },
  { code: "+86", country: "China", flag: "🇨🇳" },
];

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  id?: string;
  label?: string;
  className?: string;
  required?: boolean;
  onCountryChange?: (country: string) => void;
}

export function PhoneInput({
  value,
  onChange,
  placeholder = "Enter phone number",
  id,
  label,
  className = "",
  required = false,
  onCountryChange,
}: PhoneInputProps) {
  // Parse existing value to extract country code and number
  const parsePhoneNumber = (phone: string) => {
    if (!phone) return { countryCode: "+226", number: "" };
    
    const matchedCode = COUNTRY_CODES.find(c => phone.startsWith(c.code));
    if (matchedCode) {
      return {
        countryCode: matchedCode.code,
        number: phone.slice(matchedCode.code.length).trim(),
      };
    }
    
    return { countryCode: "+226", number: phone };
  };

  const { countryCode: initialCode, number: initialNumber } = parsePhoneNumber(value);
  const [countryCode, setCountryCode] = useState(initialCode);
  const [phoneNumber, setPhoneNumber] = useState(initialNumber);

  const handleCountryCodeChange = (code: string) => {
    setCountryCode(code);
    onChange(`${code} ${phoneNumber}`.trim());
    
    // Find the country name and call the callback
    const selectedCountry = COUNTRY_CODES.find(c => c.code === code);
    if (selectedCountry && onCountryChange) {
      onCountryChange(selectedCountry.country);
    }
  };

  const handlePhoneNumberChange = (num: string) => {
    setPhoneNumber(num);
    onChange(`${countryCode} ${num}`.trim());
  };

  return (
    <div className="space-y-2">
      {label && (
        <Label htmlFor={id}>
          {label} {required && <span className="text-destructive">*</span>}
        </Label>
      )}
      <div className="flex gap-2">
        <Select value={countryCode} onValueChange={handleCountryCodeChange}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Code" />
          </SelectTrigger>
          <SelectContent className="max-h-[300px]">
            {COUNTRY_CODES.map((c) => (
              <SelectItem key={c.code} value={c.code}>
                <span className="flex items-center gap-2">
                  <span>{c.flag}</span>
                  <span>{c.code}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          id={id}
          type="tel"
          value={phoneNumber}
          onChange={(e) => handlePhoneNumberChange(e.target.value)}
          placeholder={placeholder}
          className={className}
        />
      </div>
    </div>
  );
}
