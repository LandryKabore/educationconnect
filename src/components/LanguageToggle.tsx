import { Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTranslation } from 'react-i18next';

export function LanguageToggle() {
  const { i18n, t } = useTranslation();

  const languages = [
    { code: 'en', name: t('language.english') },
    { code: 'fr', name: t('language.french') },
    { code: 'sw', name: t('language.swahili') },
  ];

  const handleLanguageChange = (languageCode: string) => {
    i18n.changeLanguage(languageCode);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="border-slate-600 text-slate-200 bg-slate-800/50 hover:bg-slate-700 hover:border-slate-400 hover:text-white dark:border-slate-600 dark:text-slate-200 dark:bg-slate-800/50 dark:hover:bg-slate-700"
        >
          <Globe className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-slate-800/95 backdrop-blur-sm border-slate-600">
        {languages.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => handleLanguageChange(lang.code)}
            className="text-slate-200 hover:bg-slate-700 hover:text-white cursor-pointer"
          >
            {lang.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}