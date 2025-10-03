
import { useEffect, useState, useRef } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { OverlayPanel } from 'primereact/overlaypanel';
import { InputNumber } from 'primereact/inputnumber';
import axios from 'axios';

import "primereact/resources/themes/lara-light-blue/theme.css"; // or any other theme
import "primereact/resources/primereact.min.css";
import "primeicons/primeicons.css";

type ArtWork = {
  id: number;
  title: string;
  place_of_origin?: string | null;
  artist_display?: string | null;
  inscriptions?: string | null;
  date_start?: number | null;
  date_end?: number | null;
};

type ApiResponse = {
  pagination: {
    total: number;
    limit: number;
    offset: number;
    total_pages?: number;
    current_page?: number;
  };
  data: any[];
};

export default function App() {
  const [rows, setRows] = useState<ArtWork[]>([]);
  const [allRows, setAllRows] = useState<ArtWork[]>([]); // Store all fetched rows
  const [loading, setLoading] = useState(false);
  const [first, setFirst] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(12);
  const [totalRecords, setTotalRecords] = useState<number | undefined>(undefined);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedMap, setSelectedMap] = useState<Record<number, { id: number; title: string; page: number }>>({});
  const [pageSelection, setPageSelection] = useState<ArtWork[]>([]);
  const [numToSelect, setNumToSelect] = useState<number | null>(null);
  const overlayRef = useRef<any>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Fetch page data
  useEffect(() => {
    const controller = new AbortController();
    const fetchPage = async () => {
      setLoading(true);
      try {
        const res = await axios.get<ApiResponse>('https://api.artic.edu/api/v1/artworks', {
          params: { page: currentPage, limit: rowsPerPage },
          signal: controller.signal as any,
        });

        if (!mountedRef.current) return;

        const apiData = res.data;
        const mapped: ArtWork[] = apiData.data.map((d: any) => ({
          id: d.id,
          title: d.title ?? '-',
          place_of_origin: d.place_of_origin ?? null,
          artist_display: d.artist_display ?? null,
          inscriptions: d.inscriptions ?? null,
          date_start: d.date_start ?? null,
          date_end: d.date_end ?? null,
        }));

        setRows(mapped);

        // Add to allRows without duplicates
        setAllRows(prev => {
          const ids = new Set(prev.map(r => r.id));
          return [...prev, ...mapped.filter(r => !ids.has(r.id))];
        });

        const pagination = apiData.pagination;
        if (pagination) {
          setTotalRecords(pagination.total ?? mapped.length);
          if (pagination.limit && pagination.limit !== rowsPerPage) {
            setRowsPerPage(pagination.limit);
          }
        } else {
          setTotalRecords(undefined);
        }

        const currentSelected = mapped.filter(r => selectedMap.hasOwnProperty(r.id));
        setPageSelection(currentSelected);
      } catch (err) {
        if (axios.isCancel(err)) return;
        console.error('fetch error', err);
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    };

    fetchPage();
    return () => controller.abort();
  }, [currentPage, rowsPerPage]);

  useEffect(() => {
    setFirst((currentPage - 1) * rowsPerPage);
  }, [currentPage, rowsPerPage]);

  const onPage = (event: any) => {
    const newPage = Math.floor(event.first / event.rows) + 1;
    setRowsPerPage(event.rows);
    setCurrentPage(newPage);
  };

  const onSelectionChange = (e: { value: ArtWork[] }) => {
    const newSelected = e.value || [];
    const prevIds = new Set(pageSelection.map(r => r.id));
    const newIds = new Set(newSelected.map(r => r.id));

    const toAdd = newSelected.filter(r => !prevIds.has(r.id));
    const toRemove = pageSelection.filter(r => !newIds.has(r.id));

    setSelectedMap(prev => {
      const copy = { ...prev };
      toAdd.forEach(r => { copy[r.id] = { id: r.id, title: r.title, page: currentPage }; });
      toRemove.forEach(r => { delete copy[r.id]; });
      return copy;
    });

    setPageSelection(newSelected);
  };

  const selectAllOnPage = () => {
    setSelectedMap(prev => {
      const copy = { ...prev };
      rows.forEach(r => { copy[r.id] = { id: r.id, title: r.title, page: currentPage }; });
      return copy;
    });
    setPageSelection(rows.slice());
  };

  const deselectAllOnPage = () => {
    setSelectedMap(prev => {
      const copy = { ...prev };
      rows.forEach(r => { delete copy[r.id]; });
      return copy;
    });
    setPageSelection([]);
  };

  const clearAllSelections = () => {
    setSelectedMap({});
    setPageSelection([]);
  };


  // Select N rows across all pages
  const selectNRows = async () => {
  if (!numToSelect || numToSelect <= 0) return;

  let collected: ArtWork[] = [...allRows];

  // Fetch additional pages if needed
  let page = 1;
  while (collected.length < numToSelect && collected.length < totalRecords!) {
    page++;
    try {
      const res = await axios.get<ApiResponse>('https://api.artic.edu/api/v1/artworks', {
        params: { page: page, limit: rowsPerPage },
      });
      const mapped: ArtWork[] = res.data.data.map((d: any) => ({
        id: d.id,
        title: d.title ?? '-',
        place_of_origin: d.place_of_origin ?? null,
        artist_display: d.artist_display ?? null,
        inscriptions: d.inscriptions ?? null,
        date_start: d.date_start ?? null,
        date_end: d.date_end ?? null,
      }));

      const ids = new Set(collected.map(r => r.id));
      collected = [...collected, ...mapped.filter(r => !ids.has(r.id))];

      // Update allRows with new data
      setAllRows(prev => [...prev, ...mapped.filter(r => !prev.some(r2 => r2.id === r.id))]);
    } catch (err) {
      console.error('Error fetching additional pages', err);
      break;
    }
  }

  // Slice to exactly numToSelect
  const toSelect = collected.slice(0, numToSelect);

  // Reset the selection map
  setSelectedMap(() => {
    const newMap: Record<number, { id: number; title: string; page: number }> = {};
    toSelect.forEach((r, idx) => {
      newMap[r.id] = { id: r.id, title: r.title, page: Math.floor(idx / rowsPerPage) + 1 };
    });
    return newMap;
  });

  // Update pageSelection for current visible rows
  setPageSelection(toSelect.filter(r => rows.some(row => row.id === r.id)));

  // Hide overlay
  overlayRef.current?.hide && overlayRef.current.hide();
};


 const titleHeaderTemplate = () => (
  <div className="flex items-center gap-2 relative">
    {/* Toggle Button with smooth chevron animation */}
    <Button
      icon="pi pi-chevron-down"
      unstyled
      className={`p-1 transition-transform duration-200 text-gray-700 ${
        overlayRef.current?.visible ? 'rotate-180' : ''
      }`}
      onClick={(e) => overlayRef.current?.toggle(e)}
      aria-label="Toggle row selection overlay"
      aria-expanded={overlayRef.current?.visible || false}
    />

    <span className="text-md font-semibold text-black-900 truncate">
  Title
</span>


    {/* OverlayPanel for selecting number of rows */}
    <OverlayPanel
  ref={overlayRef}
  dismissable
  className="p-4 shadow-lg rounded-lg bg-white"
  showCloseIcon={false}
  style={{ minWidth: '180px', transition: 'all 0.2s ease-in-out' }}
>
  <div className="flex flex-col gap-2">
    <InputNumber
      value={numToSelect}
      onValueChange={(e) => setNumToSelect(e.value ?? null)}
      placeholder="Enter number of rows"
      min={1}
      max={totalRecords || 1000}
      showButtons={false}
      className="w-full"
      inputClassName="p-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all"
      onKeyDown={(e) => {
        if (e.key === 'Enter') selectNRows();
      }}
    />

    <small className="text-gray-500 text-xs">
      Total Rows: {totalRecords ?? '...'}
    </small>

    <button
      onClick={selectNRows}
      style={{
        backgroundColor: '#3B82F6', // Tailwind bg-blue-500
        color: '#FFFFFF',           // Tailwind text-white
      }}
      className="w-full rounded-md shadow-md p-2 flex items-center justify-center gap-2  hover:scale-105 transition-transform duration-200 text-sm"
    >
      <i className="pi pi-check"></i>
      Submit
    </button>
  </div>
</OverlayPanel>

  </div>
);



  const dataTableSelection = rows.filter(r => selectedMap.hasOwnProperty(r.id));
  const selectedItemsArray = Object.values(selectedMap);


  return (
 <div className="p-4 bg-white shadow-sm rounded-md">
  <h2 className="flex items-center gap-3 text-3xl font-bold text-gray-800 mb-4">
    <img
      src="/logo.png"
      alt="Grow Me Logo"
      className=" h-12 object-contain"
    />
    <span className="leading-tight">Grow Me - Dashboard</span>
  </h2>


      <hr
        style={{
        border: 'none',
        borderTop: '2px solid #e5e7eb',
        boxShadow: '0 1px 1px rgba(0, 0, 0, 0.05)',
        margin: '16px 0',
      }}
      />

      <div className="p-mb-3 p-d-flex p-ai-center p-jc-between">
       <div className="flex flex-wrap items-center gap-3 mb-4">
  <Button
    label="Select All on Page"
    icon="pi pi-check-circle"
    onClick={selectAllOnPage}
    className="rounded-full shadow-md px-4 py-2 hover:brightness-105 transition-all !bg-green-500 !text-white hover:scale-105 transition-transform duration-200"
  />
  <Button
    label="Deselect All on Page"
    icon="pi pi-times-circle"
    onClick={deselectAllOnPage}
    className="rounded-full shadow-md px-4 py-2 hover:brightness-105 transition-all !bg-yellow-400 !text-white hover:scale-105 transition-transform duration-200"
  />
  <Button
    label="Clear All Selections"
    icon="pi pi-trash"
    onClick={clearAllSelections}
    className="rounded-full shadow-md px-4 py-2 hover:brightness-105 transition-all !bg-red-500 !text-white hover:scale-105 transition-transform duration-200"
  />
</div>



        <div className="flex items-center gap-2 p-2 bg-gray-100 rounded-md shadow-sm w-max ">
          <strong className="text-gray-700">Selected total:</strong>
          <span>{selectedItemsArray.length}</span>
        </div>
      </div>

      <DataTable
        value={rows}
        lazy
        paginator
        first={first}
        rows={rowsPerPage}
        totalRecords={totalRecords}
        onPage={onPage}
        loading={loading}
        selectionMode="checkbox"
        selection={dataTableSelection}
        onSelectionChange={onSelectionChange}
        dataKey="id"
        showGridlines
        responsiveLayout="scroll"
        className="shadow-md bg-white rounded-md overflow-hidden"
      >
        <Column selectionMode="multiple" headerStyle={{ width: '3em' }}></Column>
        <Column field="title" header={titleHeaderTemplate}></Column>
        <Column field="place_of_origin" header="Place Of Origin"></Column>
        <Column field="artist_display" header="Artist Display"></Column>
        <Column field="date_start" header="Date Start"></Column>
        <Column field="date_end" header="Date End"></Column>
      </DataTable>

      
    </div>
  );
}
